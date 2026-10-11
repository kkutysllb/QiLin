/**
 * One tenant's Web runtime: the deployment overlay that moves its
 * deployment-scoped roots under the shared Harness home, the child process that
 * serves it, and the launch-token URL a browser follows into it.
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

/** Lifecycle state of one tenant runtime, as the hub's status read reports it. */
export type TenantRuntimeState = 'stopped' | 'starting' | 'running' | 'failed'

/** What one tenant runtime needs from the hub. */
export interface TenantRuntimeOptions {
  /** Shared Harness home every tenant runtime runs under. */
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
}

/** The overlay document that scopes one tenant's deployment roots. */
const IDENTITY_PATTERN = /^[A-Za-z0-9._-]+$/u

/**
 * Build one tenant's deployment overlay: the deployment-scoped roots the
 * tenancy plan moves, plus the account list this runtime admits.
 * @param accountId - account identity this tenant serves.
 * @returns the overlay document as YAML.
 * @throws Error when the identity cannot be written as one plain YAML scalar.
 */
export function tenantOverlayYaml(accountId: string): string {
  if (!IDENTITY_PATTERN.test(accountId)) {
    throw new Error(`qilin tenants: ${accountId} is not usable as a tenant directory name`)
  }
  return [
    `# Tenant deployment layer for account ${accountId}.`,
    '# Every expression is evaluated against the shared Harness home, so this',
    '# file moves the deployment-scoped roots and nothing else: plugins, model',
    '# settings, credentials, and the account file stay shared.',
    '- id: session-persistence-jsonl',
    '  config:',
    `    root: !!js qilinHomePath('tenants', '${accountId}', 'sessions')`,
    '- id: storage-json',
    '  config:',
    `    root: !!js qilinHomePath('tenants', '${accountId}', 'storages')`,
    '- id: session-query-sqlite',
    '  config:',
    `    path: !!js qilinHomePath('tenants', '${accountId}', 'session-query.sqlite')`,
    '    openAt: never',
    '- id: attachment-local',
    '  config:',
    `    qilinHome: !!js qilinHomePath('tenants', '${accountId}')`,
    '- id: accounts',
    '  config:',
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

  /** Epoch milliseconds of the last browser handoff; idle reclamation measures it. */
  lastUsedAt = 0

  /** How many times this tenant's runtime has started. */
  starts = 0

  /**
   * @param options - the shared home, the account this runtime serves, and how to start it.
   */
  constructor(private readonly options: TenantRuntimeOptions) {}

  /** Absolute path of this tenant's deployment overlay. */
  get overlayPath(): string {
    return join(this.tenantDir, 'cordis.patch.yml')
  }

  /** This tenant's directory under the shared home. */
  private get tenantDir(): string {
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
    this.starting ??= this.start()
    try {
      return await this.starting
    } finally {
      this.starting = undefined
    }
  }

  /** Ask this tenant's runtime to exit, holding it to the shutdown deadline. */
  async stop(): Promise<void> {
    const child = this.child
    const exited = this.exited
    if (child === undefined || exited === undefined) {
      this.state = 'stopped'
      return
    }
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
    await this.writeOverlay()
    this.state = 'starting'
    this.detail = ''
    this.output = ''
    this.launchUrl = undefined
    this.starts += 1

    const child = spawn(this.options.binPath, [
      ...this.options.execArgv,
      '--profile', this.options.profile,
      '--patch', this.overlayPath,
      '--host', '127.0.0.1',
      '--port', '0',
      '--no-open',
    ], {
      cwd: this.tenantDir,
      env: process.env,
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
    child.once('close', () => {
      if (this.child !== child) return
      this.child = undefined
      this.launchUrl = undefined
      this.exited = undefined
      this.state = 'stopped'
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
      return url
    } catch (error) {
      this.state = 'failed'
      this.detail = error instanceof Error ? error.message : String(error)
      await this.stop()
      throw error
    } finally {
      clearTimeout(deadline)
    }
  }

  /** Write this tenant's overlay when the file does not already hold it. */
  private async writeOverlay(): Promise<void> {
    const document = tenantOverlayYaml(this.options.accountId)
    const current = await readFile(this.overlayPath, 'utf8').catch(() => undefined)
    if (current === document) return
    await writeFile(this.overlayPath, document)
  }
}
