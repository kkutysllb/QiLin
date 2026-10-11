/**
 * Owner-local harness for the multi-tenant topology the tenancy plan verifies:
 * several built Web runtimes under one deployment home, each with its own
 * Harness home, so plugins, model settings, credentials, sessions, and
 * storages resolve inside that tenant and nowhere else.
 *
 * Only the account roster is shared; the tenant's home layer names it. The
 * product label on the startup URL line is a patchable row, so readiness is
 * matched by the printed URL rather than by any product name.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'
import { expect, type TestContext } from 'vitest'
import { resolveExampleLaunch } from '@qilin-agent/loader-smoke'
import { PROCESS_SHUTDOWN_TIMEOUT_MS } from '../../../../src/process-shutdown.ts'
import { TENANT_VARIABLE } from '../../../../src/tenant-runtime.ts'

const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))

/**
 * The opt-in Schedule bundle, mounted the way a deployment mounts it: the
 * shipped Web composition carries no Schedule rows, so durable tasks are a
 * composition decision. Every tenant here composes it, because whether tasks
 * exist at all is a deployment choice while whose tasks they are is not.
 */
const SCHEDULE_BUNDLE_PATCH = join(repoRoot, 'packages/experimental/schedule-bundle/cordis.patch.yml')

/** Any startup line whose text is followed by the served URL. */
const READY_URL = /(?:^|\n)[A-Za-z][\w -]*: (https?:\/\/\S+)/u

/** A Remote answer before the harness unwraps it. */
export type TenantRemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

/** One running tenant runtime, addressed over its own loopback port. */
export interface TenantHost {
  /** Tenant name this runtime serves. */
  readonly tenant: string
  /** Per-tenant working directory, the runtime's process cwd and Session cwd. */
  readonly cwd: string
  /** Process-token URL that establishes this runtime's browser session. */
  readonly url: string
  /** Origin of {@link url}. */
  readonly origin: string
  /** Launch-token session cookie for Node-side HTTP and WebSocket probes. */
  readonly cookie: string
  /**
   * Send one named-argument Remote request.
   * @param method - endpoint name, such as `session/list`.
   * @param args - the endpoint's named arguments.
   * @returns the unwrapped value.
   * @throws when the runtime answers a failure.
   */
  rpc<T>(method: string, args?: Record<string, unknown>): Promise<T>
  /**
   * Send one Remote request and return its failure instead of throwing.
   * @param method - endpoint name.
   * @param args - the endpoint's named arguments.
   * @returns the success value or the answered failure.
   */
  rpcResult<T>(method: string, args?: Record<string, unknown>): Promise<TenantRemoteResult<T>>
}

/** One forwarded Host event delivered by the `$events` stream. */
export interface ForwardedEvent {
  /** Forwarded event name. */
  readonly event: string
  /** Event arguments in emission order. */
  readonly args: readonly unknown[]
}

/** An open forwarded-event stream, with every event it has delivered so far. */
export interface ForwardedEvents {
  /** Events received since the stream opened, oldest first. */
  readonly received: readonly ForwardedEvent[]
  /**
   * Await the first event matching a predicate.
   * @param predicate - test applied to each event as it arrives.
   * @param timeoutMs - deadline for the matching event.
   * @returns the matching event.
   */
  waitFor(predicate: (event: ForwardedEvent) => boolean, timeoutMs?: number): Promise<ForwardedEvent>
  /** Close the carrier socket. */
  close(): Promise<void>
}

/** The deployment world the tenant runtimes are spawned into. */
export interface TenantWorld {
  /** Temporary directory owning this world; removed when the test finishes. */
  readonly root: string
  /** Deployment home: the account roster, and one directory per tenant. */
  readonly home: string
  /** The tenant's own Harness home, which is also its directory. */
  tenantDir(tenant: string): string
  /** The layer file inside that tenant's harness home. */
  patchPath(tenant: string): string
}

/** Options for {@link withTenantWeb}. */
export interface TenantWebOptions {
  /** Tenant names, in spawn order. */
  readonly tenants: readonly string[]
  /**
   * Runs after the deployment home and the per-tenant harness homes exist and
   * before any runtime starts, so a scenario can seed tenant-scoped durable state.
   * @param world - the prepared deployment world.
   */
  readonly prepare?: (world: TenantWorld) => Promise<void>
}

/** A booted multi-tenant world. */
export interface TenantWeb {
  /** The deployment world. */
  readonly world: TenantWorld
  /**
   * Look up one running tenant runtime.
   * @param tenant - a name passed to {@link withTenantWeb}.
   * @returns the running runtime.
   */
  host(tenant: string): TenantHost
}

/** One spawned tenant runtime plus the handles that own its process. */
interface TenantRuntime {
  readonly host: TenantHost
  readonly child: ChildProcess
  readonly completion: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  /** Output accumulated so far, for failure diagnostics. */
  output(): string
}

/**
 * The layer inside one tenant's harness home: the deployment roster it reads,
 * and nothing about plugins or model settings, which belong to this home.
 *
 * This stage verifies the data plane. The account gate and the account-to-tenant
 * mapping belong to the supervisor lane, and the shipped gate answers a
 * launch-token device cookie with a session refusal on every non-auth `/api`
 * route, so this world turns it off the way the sibling built-process lanes do.
 * @param tenant - tenant whose harness home carries the layer.
 * @returns the layer document as YAML.
 */
export function tenantPatchYaml(tenant: string): string {
  return [
    `# Tenant harness home for ${tenant}.`,
    '# The roster stays in the deployment home; this home is the tenant.',
    '- id: accounts',
    '  config:',
    '    qilinHome: !!js process.env.QILIN_DEPLOYMENT_HOME',
    '    enabled: false',
    '',
  ].join('\n')
}
/**
 * Send one named-argument Remote request to a runtime over its loopback port.
 * @param origin - the runtime's origin.
 * @param cookie - session cookie authenticating the request.
 * @param rpcId - caller-chosen request id, echoed by the answer.
 * @param method - endpoint name, such as `session/list`.
 * @param args - the endpoint's named arguments.
 * @returns the result the runtime answered.
 * @throws Error when the request is refused at the transport level.
 */
export async function tenantRemoteResult<T>(
  origin: string,
  cookie: string,
  rpcId: string,
  method: string,
  args: Record<string, unknown>,
): Promise<TenantRemoteResult<T>> {
  const response = await fetch(`${origin}/api/${method}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method, payload: { args } }),
  })
  if (!response.ok) throw new Error(`${method} answered HTTP ${String(response.status)}: ${await response.text()}`)
  const envelope = await response.json() as { result?: TenantRemoteResult<T> }
  if (envelope.result === undefined) throw new Error(`${method} answered no result`)
  return envelope.result
}

/**
 * Session identities present anywhere under one Session root.
 * @param root - the tenant's Session root.
 * @returns every `session-<id>` directory name found beneath it.
 */
export async function sessionIdsUnder(root: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 3) return
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name)
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('session-')) found.push(entry.name)
      else await walk(path, depth + 1)
    }
  }
  await walk(root, 0)
  return found
}

/** Spawn one tenant runtime and resolve once it serves its token URL. */
async function startTenant(world: TenantWorld, tenant: string): Promise<TenantRuntime> {
  const cwd = join(world.root, `${tenant}-work`)
  await mkdir(cwd, { recursive: true })
  const launch = resolveExampleLaunch({
    srcBin: join(repoRoot, 'apps/cli/src/bin.ts'),
    mode: 'lib',
    configArgs: [
      '--profile', 'web',
      '--patch', SCHEDULE_BUNDLE_PATCH,
      '--host', '127.0.0.1', '--port', '0', '--no-open',
    ],
    env: {
      NODE_OPTIONS: undefined,
      NODE_PATH: undefined,
      TSX_TSCONFIG_PATH: undefined,
      // The tenant's own harness home is the isolation; the deployment home
      // reaches its roster layer by name.
      QILIN_HOME: world.tenantDir(tenant),
      [TENANT_VARIABLE]: '1',
      QILIN_DEPLOYMENT_HOME: world.home,
      QILIN_AGENTS_HOME: join(world.tenantDir(tenant), 'agents'),
      QILIN_TELEMETRY_DISABLED: '1',
      DEEPSEEK_API_KEY: 'keyless-tenant-isolation-no-call',
      NODE_NO_WARNINGS: '1',
    },
  })
  const child = spawn(launch.command, ['--no-experimental-strip-types', ...launch.args], {
    cwd,
    env: { ...process.env, ...launch.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
  const completion = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>()
  let exited = false
  child.once('close', (code, signal) => {
    exited = true
    completion.resolve({ code, signal })
  })
  child.once('error', (error: Error) => {
    exited = true
    output += `\nspawn failed: ${String(error)}`
    completion.resolve({ code: null, signal: null })
  })

  const url = await new Promise<string>((resolveReady, rejectReady) => {
    const deadline = setTimeout(() => { rejectReady(new Error(`${tenant}: no startup URL within 60s\n${output}`)) }, 60_000)
    const tick = setInterval(() => {
      if (exited) {
        clearTimeout(deadline)
        clearInterval(tick)
        rejectReady(new Error(`${tenant}: runtime exited before readiness\n${output}`))
        return
      }
      const found = READY_URL.exec(output)?.[1]
      if (found === undefined) return
      clearTimeout(deadline)
      clearInterval(tick)
      resolveReady(found)
    }, 50)
  })

  const exchange = await fetch(url, { redirect: 'manual' })
  const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
  if (exchange.status !== 303 || cookie === undefined || cookie.length === 0) {
    throw new Error(`${tenant}: launch-token exchange returned HTTP ${String(exchange.status)}`)
  }
  const origin = new URL(url).origin

  const rpcResult = async <T>(method: string, args: Record<string, unknown> = {}): Promise<TenantRemoteResult<T>> =>
    await tenantRemoteResult<T>(origin, cookie, `tenant-${tenant}-${method}`, method, args)

  const host: TenantHost = {
    tenant,
    cwd,
    url,
    origin,
    cookie,
    rpcResult,
    async rpc<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
      const result = await rpcResult<T>(method, args)
      if (!result.ok) throw new Error(`${tenant}: ${method} failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    },
  }
  return { host, child, completion: completion.promise, output: () => output }
}

/** Ask one runtime to exit, then hold it to the CLI's own graceful deadline. */
async function stopTenant(runtime: TenantRuntime): Promise<{ forced: boolean; code: number | null; signal: NodeJS.Signals | null }> {
  let forced = false
  const watchdog = setTimeout(() => {
    forced = true
    runtime.child.kill('SIGKILL')
  }, PROCESS_SHUTDOWN_TIMEOUT_MS * 2)
  try {
    runtime.child.kill('SIGTERM')
    const result = await runtime.completion
    return { forced, ...result }
  } finally {
    clearTimeout(watchdog)
  }
}

/**
 * Open the forwarded-event stream of one tenant and await its ready item, which
 * is the proof that incremental delivery is active rather than merely accepted.
 * @param host - the tenant runtime to subscribe to.
 * @param timeoutMs - deadline for readiness, and the default per-event deadline.
 * @returns the open stream and the events it delivers.
 */
export async function openForwardedEvents(host: TenantHost, timeoutMs = 15_000): Promise<ForwardedEvents> {
  const socket = new WebSocket(`${host.origin.replace(/^http/u, 'ws')}/api/remote.mux`, {
    headers: { cookie: host.cookie },
  })
  const received: ForwardedEvent[] = []
  const streamId = `tenant-events-${host.tenant}`
  const ready = Promise.withResolvers<undefined>()
  let settled = false
  let carrierError: Error | undefined
  const waiters: {
    predicate: (event: ForwardedEvent) => boolean
    resolve: (event: ForwardedEvent) => void
    reject: (error: Error) => void
  }[] = []
  // A listener that throws becomes an uncaught exception, so every carrier
  // failure is converted into a rejection the caller awaits.
  const fail = (error: Error): void => {
    carrierError ??= error
    if (!settled) {
      settled = true
      ready.reject(error)
    }
    for (const waiter of waiters.splice(0)) waiter.reject(error)
  }
  socket.addEventListener('message', (message: WebSocket.MessageEvent) => {
    const text = typeof message.data === 'string' ? message.data : Buffer.from(message.data as Buffer).toString('utf8')
    let frame: { streamId?: string; value?: { type?: string; event?: string; args?: unknown[] } }
    try {
      frame = JSON.parse(text) as typeof frame
    } catch (error) {
      fail(new Error(`${host.tenant}: events carrier published a non-JSON frame: ${String(error)}`))
      return
    }
    if (frame.streamId !== streamId) return
    const value = frame.value
    if (value?.type === 'ready') {
      if (!settled) {
        settled = true
        ready.resolve(undefined)
      }
      return
    }
    if (value?.type !== 'emit' || value.event === undefined) return
    const event: ForwardedEvent = { event: value.event, args: value.args ?? [] }
    received.push(event)
    for (const waiter of [...waiters]) {
      if (!waiter.predicate(event)) continue
      waiters.splice(waiters.indexOf(waiter), 1)
      waiter.resolve(event)
    }
  })
  socket.addEventListener('error', () => { fail(new Error(`${host.tenant}: events carrier failed`)) })
  socket.addEventListener('close', () => { fail(new Error(`${host.tenant}: events carrier closed`)) })
  await new Promise<void>((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', () => { resolveOpen() })
    socket.addEventListener('error', () => { rejectOpen(new Error(`${host.tenant}: events carrier failed before opening`)) })
  })
  socket.send(JSON.stringify({ type: 'open', streamId, endpoint: '$events', payload: { args: {} } }))
  const notReady = setTimeout(() => {
    if (settled) return
    settled = true
    ready.reject(new Error(`${host.tenant}: forwarded events never became ready`))
  }, timeoutMs)
  try {
    await ready.promise
  } finally {
    clearTimeout(notReady)
  }
  return {
    received,
    waitFor(predicate, waitTimeoutMs = timeoutMs) {
      if (carrierError !== undefined) return Promise.reject(carrierError)
      const already = received.find(predicate)
      if (already !== undefined) return Promise.resolve(already)
      return new Promise<ForwardedEvent>((resolveWait, rejectWait) => {
        const timer = setTimeout(() => {
          waiters.splice(waiters.findIndex(waiter => waiter.resolve === resolved), 1)
          rejectWait(new Error(`${host.tenant}: no forwarded event matched within ${waitTimeoutMs}ms`))
        }, waitTimeoutMs)
        const resolved = (event: ForwardedEvent): void => { clearTimeout(timer); resolveWait(event) }
        waiters.push({ predicate, resolve: resolved, reject: rejectWait })
      })
    },
    async close() {
      await new Promise<void>((resolveClose) => {
        socket.addEventListener('close', () => { resolveClose() })
        socket.close()
      })
    },
  }
}

/**
 * Boot every named tenant's built Web runtime over one shared home, then hold
 * each to a clean exit and remove the world.
 * @param test - owning Vitest case, including its cleanup hooks.
 * @param options - tenant names and the pre-start seeding hook.
 * @param inspect - assertions against the running tenants and the shared world.
 */
export async function withTenantWeb(
  test: TestContext,
  options: TenantWebOptions,
  inspect: (tenants: TenantWeb) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-tenant-isolation-'))
  test.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const home = join(root, 'home')
  await mkdir(home, { recursive: true })
  const world: TenantWorld = {
    root,
    home,
    tenantDir: (tenant: string) => join(home, 'tenants', tenant),
    patchPath: (tenant: string) => join(home, 'tenants', tenant, 'cordis.patch.yml'),
  }
  for (const tenant of options.tenants) {
    await mkdir(world.tenantDir(tenant), { recursive: true })
    await writeFile(world.patchPath(tenant), tenantPatchYaml(tenant))
  }
  await options.prepare?.(world)

  const running = new Map<string, TenantRuntime>()
  const failures: unknown[] = []
  let inspectionError: unknown
  try {
    for (const tenant of options.tenants) running.set(tenant, await startTenant(world, tenant))
    await inspect({
      world,
      host: (tenant: string) => {
        const runtime = running.get(tenant)
        if (runtime === undefined) throw new Error(`unknown tenant ${tenant}`)
        return runtime.host
      },
    })
  } catch (error) {
    // Held rather than rethrown here: a teardown that fails too must not replace
    // the assertion that failed first.
    inspectionError = error
  } finally {
    for (const [tenant, runtime] of running) {
      const stopped = await stopTenant(runtime)
      if (stopped.forced) failures.push(new Error(`${tenant}: runtime ignored SIGTERM\n${runtime.output()}`))
      else if (stopped.code !== 0 || stopped.signal !== null) {
        failures.push(new Error(`${tenant}: runtime exited code ${String(stopped.code)} signal ${String(stopped.signal)}\n${runtime.output()}`))
      }
    }
  }
  if (failures.length > 0 && inspectionError !== undefined) {
    throw new AggregateError([inspectionError, ...failures], 'tenant assertions failed and teardown was incomplete')
  }
  if (failures.length > 0) throw new AggregateError(failures, 'tenant runtimes did not shut down cleanly')
  if (inspectionError !== undefined) throw inspectionError
  expect(test.signal.aborted).toBe(false)
}
