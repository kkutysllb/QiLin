/**
 * One tenant's Web runtime: its own Harness home under the deployment home, the
 * child process that serves it, and the launch-token URL a browser follows into
 * it.
 *
 * A tenant is a deployment of its own. The child runs with `QILIN_HOME` set to
 * this tenant's directory, so plugins, model settings, credentials, sessions,
 * storages, attachments, skills, and presets all resolve inside it and nowhere
 * else. The only shared file is the deployment's account roster, which the
 * tenant's home layer points at while admitting exactly its own account.
 * @module @qilin-agent/cli/tenant-runtime
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Any startup line whose label is followed by the served URL. */
const READY_URL = /(?:^|\n)[A-Za-z][\w -]*: (https?:\/\/\S+)/u

/** Deadline for one tenant runtime to print its URL. */
const START_DEADLINE_MS = 120_000

/** Deadline for one tenant runtime to exit after SIGTERM, before SIGKILL. */
const STOP_DEADLINE_MS = 15_000

/** Retained child output; enough for the failing lines and no more. */
const OUTPUT_LIMIT = 64_000

/**
 * Ceiling the retry wait reaches. A tenant runtime that cannot start is broken
 * in a way a browser reload does not fix, so the wait grows up to this bound
 * instead of retrying on every visit.
 */
const BACKOFF_CEILING_MS = 300_000

/** Lifecycle state of one tenant runtime, as the hub's status read reports it. */
export type TenantRuntimeState = 'stopped' | 'starting' | 'running' | 'failed'

/** What one tenant runtime needs from the hub. */
export interface TenantRuntimeOptions {
  /**
   * Deployment home: it holds the account roster and one directory per tenant,
   * and every tenant runtime's own harness home lives under it.
   */
  readonly home: string
  /** Account identity this runtime serves, which also names its tenant directory. */
  readonly accountId: string
  /** Profile each runtime boots. */
  readonly profile: string
  /** Node entry of the qilin CLI the hub re-executes. */
  readonly binPath: string
  /** Node options the hub itself started with, so the child runs the same way. */
  readonly execArgv: readonly string[]
  /**
   * First wait before retrying a runtime that failed to start. It doubles per
   * consecutive failure, up to {@link BACKOFF_CEILING_MS}.
   */
  readonly restartBackoffMilliseconds: number
  /**
   * Where one line of this runtime's own diagnostics goes.
   * @param line - one line the runtime wrote to its standard error.
   */
  readonly log?: (line: string) => void
}

/** What the hub's status read reports about one tenant runtime. */
export interface TenantRuntimeStatus {
  /** Account identity this runtime serves. */
  readonly accountId: string
  /** Lifecycle state. */
  readonly state: TenantRuntimeState
  /** Process id while a child is running. */
  readonly pid: number | undefined
  /** Origin the browser is handed to, without the launch token. */
  readonly origin: string | undefined
  /** How many times this tenant's runtime has started. */
  readonly starts: number
  /** Why the last start failed, when it did. */
  readonly detail: string
  /** Consecutive failed starts since the last one that reached its URL. */
  readonly consecutiveFailures: number
  /** Epoch milliseconds before which a start is refused, after failures. */
  readonly retryAt: number | undefined
}

/** The patch document one tenant's harness home carries. */
const IDENTITY_PATTERN = /^[A-Za-z0-9._-]+$/u

/** Environment variable naming the deployment home to a tenant runtime. */
export const DEPLOYMENT_HOME_VARIABLE = 'QILIN_DEPLOYMENT_HOME'

/**
 * Marks the process as one account's runtime rather than the entry that serves
 * the public address. The supervisor sets it for every child it starts; a
 * deployment that starts a single-account runtime directly sets it too.
 */
export const TENANT_VARIABLE = 'QILIN_TENANT'

/**
 * Build one tenant's harness-home layer: the account roster it reads and the
 * single account it admits.
 *
 * The roster stays in the deployment home so one command manages every account,
 * while the tenant's own home holds everything else. The deployment home
 * arrives through the environment rather than as a literal, so a path with
 * quotes or a trailing backslash cannot change the document's meaning.
 * @param accountId - account identity this tenant serves.
 * @returns the layer document as YAML.
 * @throws Error when the identity cannot be written as one plain YAML scalar.
 */
export function tenantPatchYaml(accountId: string): string {
  if (!IDENTITY_PATTERN.test(accountId)) {
    throw new Error(`qilin tenants: ${accountId} is not usable as a tenant directory name`)
  }
  return [
    `# Tenant harness-home layer for account ${accountId}.`,
    '# This runtime admits exactly that account and reads the deployment roster;',
    '# its plugins, model settings, credentials, sessions, and storages live in',
    '# this tenant home.',
    '- id: accounts',
    '  config:',
    `    qilinHome: !!js process.env.${DEPLOYMENT_HOME_VARIABLE}`,
    '    admittedAccounts:',
    `      - '${accountId}'`,
    '    registration: closed',
    '',
  ].join('\n')
}

/** One tenant's Web runtime, started on demand and reclaimed when idle. */
export class TenantRuntime {
  private child: ChildProcess | undefined
  private exited: Promise<void> | undefined
  private launchUrl: string | undefined
  private state: TenantRuntimeState = 'stopped'
  private detail = ''
  private output = ''
  private starting: Promise<string> | undefined
  private consecutiveFailures = 0
  private retryAt: number | undefined
  private intentional = false

  /** Epoch milliseconds of the last browser handoff; idle reclamation measures it. */
  lastUsedAt = 0

  /** How many times this tenant's runtime has started. */
  starts = 0

  /**
   * @param options - the shared home, the account this runtime serves, and how to start it.
   */
  constructor(private readonly options: TenantRuntimeOptions) {}

  /**
   * Where the hub sends this runtime's traffic: its origin, and the entry path
   * carrying the launch token the first request exchanges.
   * @returns the target, or undefined when the runtime is not serving yet.
   */
  proxyTarget(): { readonly origin: string; readonly entry: string } | undefined {
    if (this.launchUrl === undefined) return undefined
    const url = new URL(this.launchUrl)
    return { origin: url.origin, entry: `${url.pathname}${url.search}` }
  }

  /** Absolute path of this tenant's harness-home layer. */
  get patchPath(): string {
    return join(this.tenantDir, 'cordis.patch.yml')
  }

  /**
   * This tenant's harness home: everything the runtime owns lives under it,
   * and the deployment home holds only the roster and these directories.
   */
  get tenantDir(): string {
    return join(this.options.home, 'tenants', this.options.accountId)
  }

  /** What the hub's status read reports about this tenant. */
  status(): TenantRuntimeStatus {
    return {
      accountId: this.options.accountId,
      state: this.state,
      pid: this.child?.pid,
      origin: this.launchUrl === undefined ? undefined : new URL(this.launchUrl).origin,
      starts: this.starts,
      detail: this.detail,
      consecutiveFailures: this.consecutiveFailures,
      retryAt: this.retryAt,
    }
  }

  /**
   * Return this tenant's launch URL, starting the runtime when it is not serving.
   * @returns the launch-token URL of the running runtime.
   * @throws Error when the runtime did not become ready; the state then reports `failed`.
   */
  async ensure(): Promise<string> {
    this.lastUsedAt = Date.now()
    if (this.state === 'running' && this.launchUrl !== undefined) return this.launchUrl
    const retryAt = this.retryAt
    if (this.consecutiveFailures > 0 && retryAt !== undefined && Date.now() < retryAt) {
      throw new Error(`qilin tenants: the runtime for ${this.options.accountId} failed ${String(this.consecutiveFailures)} time(s) and is not retried before ${new Date(retryAt).toISOString()}: ${this.detail}`)
    }
    this.starting ??= this.start()
    try {
      return await this.starting
    } finally {
      this.starting = undefined
    }
  }

  /**
   * Count one failed start or one crash of a runtime that had been serving, and
   * schedule the earliest time the next attempt may run.
   * @param reason - what to report as the current detail.
   */
  private recordFailure(reason: string): void {
    this.detail = reason
    this.consecutiveFailures += 1
    const wait = Math.min(
      this.options.restartBackoffMilliseconds * 2 ** (this.consecutiveFailures - 1),
      BACKOFF_CEILING_MS,
    )
    this.retryAt = Date.now() + wait
  }

  /** Ask this tenant's runtime to exit, holding it to the shutdown deadline. */
  async stop(): Promise<void> {
    const child = this.child
    const exited = this.exited
    if (child === undefined || exited === undefined) {
      // A failed runtime stays failed until a start succeeds, so its detail and
      // retry time survive the stop that follows the failure.
      if (this.state !== 'failed') this.state = 'stopped'
      return
    }
    // A requested stop is not a crash, so it neither records a failure nor
    // delays the next start.
    this.intentional = true
    child.kill('SIGTERM')
    const killed = setTimeout(() => { child.kill('SIGKILL') }, STOP_DEADLINE_MS)
    try {
      await exited
    } finally {
      clearTimeout(killed)
    }
  }

  /** Start one child, wait for its URL, and keep its handles. */
  private async start(): Promise<string> {
    await mkdir(this.tenantDir, { recursive: true })
    await this.writePatch()
    this.state = 'starting'
    this.detail = ''
    this.output = ''
    this.launchUrl = undefined
    this.starts += 1

    const child = spawn(this.options.binPath, [
      ...this.options.execArgv,
      '--profile', this.options.profile,
      '--host', '127.0.0.1',
      '--port', '0',
      '--no-open',
    ], {
      cwd: this.tenantDir,
      // The tenant's harness home is the isolation: every root the runtime
      // resolves comes from QILIN_HOME, so plugins and model settings are this
      // account's own. The deployment home reaches the roster layer by name.
      env: {
        ...process.env,
        QILIN_HOME: this.tenantDir,
        [TENANT_VARIABLE]: '1',
        [DEPLOYMENT_HOME_VARIABLE]: this.options.home,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const ready = Promise.withResolvers<string>()
    const append = (chunk: Buffer | string): void => {
      this.output = `${this.output}${String(chunk)}`.slice(-OUTPUT_LIMIT)
      const found = READY_URL.exec(this.output)?.[1]
      if (found !== undefined) ready.resolve(found)
    }
    child.stdout.setEncoding('utf8').on('data', append)
    // Only standard error is forwarded: the standard output line carries the
    // launch token, and a supervisor's log is not where a capability belongs.
    let pending = ''
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      append(chunk)
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim() !== '') this.options.log?.(line)
      }
    })
    const exited = Promise.withResolvers<void>()
    child.once('error', (error: Error) => {
      this.output = `${this.output}\nspawn failed: ${String(error)}`.slice(-OUTPUT_LIMIT)
    })
    child.once('close', (code) => {
      if (this.child !== child) return
      const crashed = this.launchUrl !== undefined && !this.intentional
      this.child = undefined
      this.launchUrl = undefined
      this.exited = undefined
      this.intentional = false
      this.state = crashed ? 'failed' : 'stopped'
      if (crashed) this.recordFailure(`the runtime for ${this.options.accountId} exited with code ${String(code)} after it was ready`)
      ready.reject(new Error(`qilin tenants: the runtime for ${this.options.accountId} exited before its URL`))
      exited.resolve()
    })
    this.child = child
    this.exited = exited.promise

    const deadline = setTimeout(() => {
      ready.reject(new Error(`qilin tenants: the runtime for ${this.options.accountId} printed no URL within ${String(START_DEADLINE_MS)}ms\n${this.output}`))
    }, START_DEADLINE_MS)
    try {
      const url = await ready.promise
      this.launchUrl = url
      this.state = 'running'
      this.consecutiveFailures = 0
      this.retryAt = undefined
      this.detail = ''
      return url
    } catch (error) {
      this.state = 'failed'
      this.recordFailure(error instanceof Error ? error.message : String(error))
      await this.stop()
      throw error
    } finally {
      clearTimeout(deadline)
    }
  }

  /** Write this tenant's home layer when the file does not already hold it. */
  private async writePatch(): Promise<void> {
    const document = tenantPatchYaml(this.options.accountId)
    const current = await readFile(this.patchPath, 'utf8').catch(() => undefined)
    if (current === document) return
    await writeFile(this.patchPath, document)
  }
}
