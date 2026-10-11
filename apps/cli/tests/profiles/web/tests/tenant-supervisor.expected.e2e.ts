/**
 * Multi-tenant stage P2 (plans/2026-10-11-multi-user-tenancy.md §8): `qilin
 * tenants serve` over one shared Harness home. The hub answers a directory,
 * hands each account to a runtime of its own, and reclaims an idle runtime
 * without losing that account's Sessions.
 *
 * The hub authenticates nobody, so the boundary is asserted where it is
 * enforced: each tenant runtime keeps the shared account file's gate and admits
 * only its own account, and the same request under the other account's
 * credentials is refused.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { AccountStore, accountsFilePath } from '@qilin-agent/accounts-local'
import { resolveExampleLaunch } from '@qilin-agent/loader-smoke'
import { openForwardedEvents, sessionIdsUnder, tenantRemoteResult, type TenantHost } from './tenant-web-process.ts'

const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))

/** The hub's own startup line. */
const READY_URL = /qilin tenants: (https?:\/\/\S+)/u

/**
 * The idle window this scenario gives the hub. Reclamation is measured from the
 * last handoff, and a tenant runtime takes about a second to start, so the
 * window has to outlast the handoff sequence itself.
 */
const IDLE_MILLISECONDS = 4000

const ALICE_PASSWORD = 'alice-password'
const BOB_PASSWORD = 'bob-password'

/** One running hub. */
interface RunningHub {
  readonly child: ChildProcess
  /** Origin the hub serves, with a trailing slash. */
  readonly base: string
  /** Everything the hub printed so far. */
  readonly output: () => string
}

/** One tenant entry of the hub's status read. */
interface TenantStatus {
  readonly accountId: string
  readonly username: string | null
  readonly state: string
  readonly origin?: string
  readonly starts: number
  readonly consecutiveFailures: number
  readonly retryAt?: number
}

/** The hub's whole status document. */
interface HubStatus {
  readonly mode: 'handoff' | 'single-origin'
  readonly maxTenants: number
  readonly alive: number
  readonly tenants: TenantStatus[]
}

/** What one hub start takes beyond the shared home. */
interface HubOptions {
  /** Profile each tenant runtime boots; a name no profile holds fails every start. */
  readonly profile?: string
  /** Most tenant runtimes the hub keeps alive at once. */
  readonly maxTenants?: number
  /** First wait before retrying a runtime that failed to start. */
  readonly restartBackoffMs?: number
  /** Serve every tenant through the hub origin instead of redirecting to the runtime port. */
  readonly singleOrigin?: boolean
}

/** Start the hub over one shared home and wait for its URL. */
async function startHub(root: string, home: string, options: HubOptions = {}): Promise<RunningHub> {
  const launch = resolveExampleLaunch({
    srcBin: join(repoRoot, 'apps/cli/src/bin.ts'),
    mode: 'lib',
    configArgs: [
      'tenants', 'serve', '--port', '0', '--idle-ms', String(IDLE_MILLISECONDS),
      ...(options.profile === undefined ? [] : ['--profile', options.profile]),
      ...(options.maxTenants === undefined ? [] : ['--max-tenants', String(options.maxTenants)]),
      ...(options.restartBackoffMs === undefined ? [] : ['--restart-backoff-ms', String(options.restartBackoffMs)]),
      ...(options.singleOrigin === true ? ['--single-origin'] : []),
    ],
    env: {
      NODE_OPTIONS: undefined,
      NODE_PATH: undefined,
      QILIN_HOME: home,
      QILIN_AGENTS_HOME: join(root, '.agents'),
      QILIN_TELEMETRY_DISABLED: '1',
      DEEPSEEK_API_KEY: 'keyless-tenant-supervisor-no-call',
      NODE_NO_WARNINGS: '1',
    },
  })
  const child = spawn(launch.command, launch.args, {
    cwd: root,
    env: { ...process.env, ...launch.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
  const ready = Promise.withResolvers<string>()
  const deadline = setTimeout(() => { ready.reject(new Error(`the hub printed no URL within 30s\n${output}`)) }, 30_000)
  const tick = setInterval(() => {
    const found = READY_URL.exec(output)?.[1]
    if (found !== undefined) ready.resolve(found)
  }, 50)
  child.once('close', (code) => { ready.reject(new Error(`the hub exited before readiness (${String(code)})\n${output}`)) })
  try {
    return { child, base: await ready.promise, output: () => output }
  } finally {
    clearTimeout(deadline)
    clearInterval(tick)
  }
}

/** Ask the hub to exit and hold it to the CLI's own shutdown. */
async function stopHub(hub: RunningHub): Promise<number | null> {
  if (hub.child.exitCode !== null) return hub.child.exitCode
  const exited = Promise.withResolvers<number | null>()
  hub.child.once('close', (code) => { exited.resolve(code) })
  hub.child.kill('SIGTERM')
  const forced = setTimeout(() => { hub.child.kill('SIGKILL') }, 20_000)
  try {
    return await exited.promise
  } finally {
    clearTimeout(forced)
  }
}

/** The hub's status read. */
async function hubStatus(base: string): Promise<TenantStatus[]> {
  return (await hubStatusDocument(base)).tenants
}

/** The hub's whole status read, cap and live count included. */
async function hubStatusDocument(base: string): Promise<HubStatus> {
  const response = await fetch(`${base}status`)
  if (response.status !== 200) throw new Error(`the hub's status read answered ${String(response.status)}`)
  return await response.json() as HubStatus
}

/** Follow one account's handoff and return the URL the hub sent the browser to. */
async function handoff(base: string, username: string): Promise<string> {
  const response = await fetch(`${base}t/${username}`, { redirect: 'manual' })
  expect(response.status, `handoff for ${username}`).toBe(303)
  const location = response.headers.get('location')
  if (location === null) throw new Error(`the handoff for ${username} named no location`)
  return location
}

/** Sign one account in at its own runtime and return the session cookie. */
async function login(origin: string, identifier: string, password: string): Promise<string> {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  })
  if (response.status !== 200) throw new Error(`${identifier} at ${origin} sign-in answered ${String(response.status)}`)
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]
  if (cookie === undefined || cookie === '') throw new Error(`${identifier} at ${origin} sign-in set no cookie`)
  return cookie
}

/** Send one named-argument Remote request and unwrap its value. */
async function remote<T>(origin: string, cookie: string, method: string, args: Record<string, unknown>): Promise<T> {
  const result = await tenantRemoteResult<T>(origin, cookie, `tenant-supervisor-${method}`, method, args)
  if (!result.ok) throw new Error(`${method} failed: ${result.error.code}: ${result.error.message}`)
  return result.value
}

/** Whether one origin still answers HTTP at all. */
async function reachable(origin: string): Promise<boolean> {
  return await fetch(origin, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false)
}

it('serves one isolated runtime per account and reclaims an idle one', { timeout: 240_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'qilin-tenant-supervisor-'))
  const home = join(root, 'home')
  await mkdir(home, { recursive: true })
  const store = await AccountStore.open(accountsFilePath(home))
  const alice = await store.add({ username: 'alice' }, ALICE_PASSWORD)
  const bob = await store.add({ username: 'bob' }, BOB_PASSWORD)

  let hub: RunningHub | undefined
  let lastOrigin = ''
  try {
    hub = await startHub(root, home)
    // Held in a const so the polls below keep the narrowed origin.
    const base = hub.base

    // 1. The hub's directory names every account of the shared file.
    const index = await fetch(base)
    expect(index.status).toBe(200)
    const directory = await index.text()
    expect(directory).toContain('alice')
    expect(directory).toContain('bob')

    // 2. Each account is handed to a runtime of its own, under the shared home.
    const aliceUrl = await handoff(base, 'alice')
    const bobUrl = await handoff(base, 'bob')
    const aliceOrigin = new URL(aliceUrl).origin
    const bobOrigin = new URL(bobUrl).origin
    lastOrigin = bobOrigin
    expect(aliceUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/workspace\?token=/u)
    expect(aliceOrigin).not.toBe(bobOrigin)
    expect(aliceOrigin).not.toBe(new URL(base).origin)

    // 3. The boundary is the runtime's own gate over the SHARED account file: the
    // file holds both accounts, and each runtime admits only its own. Signing in
    // with the other account's credentials is the refusal a wrong password gets.
    const foreign = await fetch(`${aliceOrigin}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'bob', password: BOB_PASSWORD }),
    })
    expect(foreign.status).toBe(401)
    expect(await foreign.json()).toMatchObject({ error: { code: 'invalid-credentials' } })
    const aliceCookie = await login(aliceOrigin, 'alice', ALICE_PASSWORD)
    const bobCookie = await login(bobOrigin, 'bob', BOB_PASSWORD)

    // 4. Sessions stay with the account that created them, in its own root.
    const aliceWork = join(root, 'alice-work')
    await mkdir(aliceWork, { recursive: true })
    const aliceSession = await remote<{ sessionId: string }>(aliceOrigin, aliceCookie, 'session/create', { request: { cwd: aliceWork } })
    const aliceList = await remote<{ items: { sessionId: string }[] }>(aliceOrigin, aliceCookie, 'session/list', { _request: {} })
    const bobList = await remote<{ items: { sessionId: string }[] }>(bobOrigin, bobCookie, 'session/list', { _request: {} })
    expect(aliceList.items.map(item => item.sessionId)).toContain(aliceSession.sessionId)
    expect(bobList.items.map(item => item.sessionId)).not.toContain(aliceSession.sessionId)
    expect(await sessionIdsUnder(join(home, 'tenants', alice.id, 'sessions'))).toContain(aliceSession.sessionId)
    expect(await sessionIdsUnder(join(home, 'tenants', bob.id, 'sessions'))).toEqual([])

    // 5. The hub's status read reports origins and never the launch token.
    const running = await hubStatus(base)
    expect(running.map(tenant => [tenant.username, tenant.state])).toEqual([['alice', 'running'], ['bob', 'running']])
    expect(JSON.stringify(running)).not.toContain('token=')

    // 6. The idle window reclaims both runtimes, and the account's data survives:
    // a second handoff starts a runtime of its own over the same tenant directory.
    await expect.poll(
      async () => (await hubStatus(base)).map(tenant => tenant.state),
      { timeout: 30_000, interval: 250 },
    ).toEqual(['stopped', 'stopped'])
    const aliceAgain = await handoff(base, 'alice')
    const againOrigin = new URL(aliceAgain).origin
    expect(againOrigin).not.toBe(aliceOrigin)
    const againCookie = await login(againOrigin, 'alice', ALICE_PASSWORD)
    const relisted = await remote<{ items: { sessionId: string }[] }>(againOrigin, againCookie, 'session/list', { _request: {} })
    expect(relisted.items.map(item => item.sessionId)).toContain(aliceSession.sessionId)
    expect((await hubStatus(base)).find(tenant => tenant.username === 'alice')?.origin).toBe(againOrigin)
    lastOrigin = againOrigin

    // 7. The hub takes its tenant runtimes with it.
    expect(await stopHub(hub)).toBe(0)
    hub = undefined
    await expect.poll(async () => await reachable(lastOrigin), { timeout: 10_000, interval: 250 }).toBe(false)
  } catch (error) {
    const evidence = hub === undefined ? '' : `\n${hub.output().slice(-4000)}`
    throw new Error(`${error instanceof Error ? error.message : String(error)}${evidence}`, { cause: error })
  } finally {
    if (hub !== undefined) {
      await stopHub(hub)
      // The hub kills its tenant runtimes on the way out, so a failed case leaves
      // no runtime behind either.
      if (lastOrigin !== '') await expect.poll(async () => await reachable(lastOrigin), { timeout: 10_000, interval: 250 }).toBe(false)
    }
    await rm(root, { recursive: true, force: true })
  }
})

it('bounds how many runtimes live at once and backs off a runtime that cannot start', { timeout: 240_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'qilin-tenant-cap-'))
  const home = join(root, 'home')
  await mkdir(home, { recursive: true })
  const store = await AccountStore.open(accountsFilePath(home))
  await store.add({ username: 'alice' }, ALICE_PASSWORD)
  await store.add({ username: 'bob' }, BOB_PASSWORD)

  let hub: RunningHub | undefined
  let lastOrigin = ''
  try {
    // 1. The cap is reported before anything runs, and the hub keeps one runtime.
    const boundedHub = await startHub(root, home, { maxTenants: 1, restartBackoffMs: 60_000 })
    hub = boundedHub
    const base = boundedHub.base
    expect(await hubStatusDocument(base)).toMatchObject({ maxTenants: 1, alive: 0 })

    // 2. Starting a second runtime past the cap reclaims the least recently used one.
    const aliceOrigin = new URL(await handoff(base, 'alice')).origin
    const bobOrigin = new URL(await handoff(base, 'bob')).origin
    lastOrigin = bobOrigin
    expect(aliceOrigin).not.toBe(bobOrigin)
    expect(boundedHub.output()).toMatch(/reclaiming/u)
    const capped = await hubStatusDocument(base)
    expect(capped.alive).toBe(1)
    expect(capped.tenants.map(tenant => [tenant.username, tenant.state])).toEqual([['alice', 'stopped'], ['bob', 'running']])

    // 3. Handing alice back reclaims bob, so the bound holds whichever way it moves.
    const aliceAgain = new URL(await handoff(base, 'alice')).origin
    lastOrigin = aliceAgain
    expect(aliceAgain).not.toBe(aliceOrigin)
    expect((await hubStatusDocument(base)).alive).toBe(1)
    expect(await stopHub(boundedHub)).toBe(0)
    hub = undefined

    // 4. A runtime that cannot start is not retried on every visit: the hub
    //    reports the failure, and a handoff inside the wait spawns nothing.
    const failing = await startHub(root, home, { profile: 'no-such-tenant-profile', restartBackoffMs: 60_000 })
    hub = failing
    const refused = await fetch(`${failing.base}t/alice`, { redirect: 'manual' })
    expect(refused.status).toBe(503)
    const failed = (await hubStatusDocument(failing.base)).tenants
    expect(failed.map(tenant => [tenant.username, tenant.state, tenant.starts, tenant.consecutiveFailures]))
      .toEqual([['alice', 'failed', 1, 1]])
    expect(failed[0]?.retryAt ?? 0).toBeGreaterThan(Date.now())

    const again = await fetch(`${failing.base}t/alice`, { redirect: 'manual' })
    expect(again.status).toBe(503)
    expect((await hubStatusDocument(failing.base)).tenants.map(tenant => tenant.starts)).toEqual([1])
    expect(await stopHub(failing)).toBe(0)
    hub = undefined
  } catch (error) {
    const evidence = hub === undefined ? '' : `\n${hub.output().slice(-4000)}`
    throw new Error(`${error instanceof Error ? error.message : String(error)}${evidence}`, { cause: error })
  } finally {
    if (hub !== undefined) await stopHub(hub)
    if (lastOrigin !== '') await expect.poll(async () => await reachable(lastOrigin), { timeout: 10_000, interval: 250 }).toBe(false)
    await rm(root, { recursive: true, force: true })
  }
})

it('serves one browser through the hub origin by routing cookie', { timeout: 240_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'qilin-tenant-single-origin-'))
  const home = join(root, 'home')
  await mkdir(home, { recursive: true })
  const store = await AccountStore.open(accountsFilePath(home))
  const alice = await store.add({ username: 'alice' }, ALICE_PASSWORD)

  let hub: RunningHub | undefined
  try {
    hub = await startHub(root, home, { singleOrigin: true })
    const base = hub.base
    const hubOrigin = new URL(base).origin
    expect((await hubStatusDocument(base)).mode).toBe('single-origin')

    // 1. The handoff never leaves the hub origin: the runtime's own token
    //    exchange is proxied, and the hub adds the routing cookie that names
    //    the tenant for every later request.
    const handoffResponse = await fetch(`${base}t/alice`, { redirect: 'manual' })
    expect(handoffResponse.status).toBe(303)
    expect(handoffResponse.headers.get('location')).toBe('/workspace')
    const setCookies = handoffResponse.headers.getSetCookie()
    expect(setCookies.some(cookie => cookie.startsWith(`qilin_tenant=${alice.id}`))).toBe(true)
    const jar = setCookies.map(cookie => cookie.split(';', 1)[0]).join('; ')
    expect(jar).toMatch(/qilin_tenant=/u)

    // 2. The document is reached at the hub root: /workspace is an absolute
    //    path that only the routing cookie can attribute to a tenant.
    const document = await fetch(`${base}workspace`, { headers: { cookie: jar } })
    expect(document.status).toBe(200)
    expect(document.headers.get('content-type') ?? '').toContain('text/html')
    expect(await document.text()).toContain('<html')

    // 3. The API crosses the same hop with any method, and the tenant's
    //    same-origin fence still decides one hop out: an Origin naming the hub
    //    is rewritten to the runtime and accepted, while an Origin naming
    //    another site is refused before any runtime sees the request.
    const accepted = await fetch(`${base}api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: hubOrigin, cookie: jar },
      body: JSON.stringify({ identifier: 'alice', password: ALICE_PASSWORD }),
    })
    expect(accepted.status).toBe(200)
    // The account session cookie the runtime set crossed the hop too, so one
    // browser keeps one jar for the tenant it is signed in to.
    const accountCookies = accepted.headers.getSetCookie().map(cookie => cookie.split(';', 1)[0])
    expect(accountCookies.length).toBeGreaterThan(0)
    const authenticated = [jar, ...accountCookies].join('; ')
    const refused = await fetch(`${base}api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://evil.invalid', cookie: jar },
      body: JSON.stringify({ identifier: 'alice', password: ALICE_PASSWORD }),
    })
    expect(refused.status).toBe(403)
    expect(await refused.text()).toMatch(/not this hub/u)

    // 4. A Remote request and the mux upgrade cross the hop too: the upgrade
    //    is an absolute path, and its ready item proves the frame pipe.
    const listing = await tenantRemoteResult<{ items: { sessionId: string }[] }>(hubOrigin, authenticated, 'through-hub', 'session/list', { _request: {} })
    expect(listing.ok).toBe(true)
    const proxied: TenantHost = {
      tenant: 'alice-through-hub',
      cwd: root,
      url: base,
      origin: hubOrigin,
      cookie: authenticated,
      rpc: async () => { throw new Error('the upgrade assertion does not use rpc') },
      rpcResult: async () => { throw new Error('the upgrade assertion does not use rpcResult') },
    }
    const events = await openForwardedEvents(proxied)
    await events.close()

    // 5. Reclamation counts proxied traffic rather than a handoff: requests
    //    spread across the idle window keep the runtime alive...
    const until = Date.now() + IDLE_MILLISECONDS + 3000
    while (Date.now() < until) {
      const status = await fetch(`${base}api/auth/status`, { headers: { cookie: authenticated } })
      expect(status.status).toBe(200)
      await new Promise(resolve => setTimeout(resolve, 1200))
    }
    expect((await hubStatus(base)).find(tenant => tenant.username === 'alice')?.state).toBe('running')

    // ... and stop counting the moment the browser does.
    await expect.poll(
      async () => (await hubStatus(base)).map(tenant => tenant.state),
      { timeout: 30_000, interval: 250 },
    ).toEqual(['stopped'])
  } catch (error) {
    const evidence = hub === undefined ? '' : `\n${hub.output().slice(-4000)}`
    throw new Error(`${error instanceof Error ? error.message : String(error)}${evidence}`, { cause: error })
  } finally {
    if (hub !== undefined) await stopHub(hub)
    await rm(root, { recursive: true, force: true })
  }
})
