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
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { AccountStore, accountsFilePath } from '@qilin-agent/accounts-local'
import { resolveExampleLaunch } from '@qilin-agent/loader-smoke'
import { BOOTSTRAP_DIRECTORY } from '../../../../src/tenant-runtime.ts'
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
const FIRST_RUN = 'first-run-account'
const FIRST_RUN_PASSWORD = 'first-run-password'
const SECOND_USER = 'second-account'
const SECOND_USER_PASSWORD = 'second-account-password'

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
  /** The deployment entry to invoke: the Web profile, or the product profile. */
  readonly entry?: 'web' | 'qilin'
  /** Profile each tenant runtime boots; a name no profile holds fails every start. */
  readonly profile?: string
  /** Most tenant runtimes the hub keeps alive at once. */
  readonly maxTenants?: number
  /** First wait before retrying a runtime that failed to start. */
  readonly restartBackoffMs?: number
  /**
   * Give every account an origin of its own instead of serving them all through
   * the deployment's address, so one browser can hold two accounts at once.
   */
  readonly perAccountPorts?: boolean
  /** Serve every tenant through the hub origin instead of redirecting to the runtime port. */
  /** Idle window; 0 keeps every runtime. */
  readonly idleMs?: number
}

/** Start the hub over one shared home and wait for its URL. */
async function startHub(root: string, home: string, options: HubOptions = {}): Promise<RunningHub> {
  const launch = resolveExampleLaunch({
    srcBin: join(repoRoot, 'apps/cli/src/bin.ts'),
    mode: 'lib',
    // The deployment entry: one command, one public address, one runtime per
    // account. A per-account-ports mode is not part of the product surface, so
    // the whole lane runs the single-origin routing it always did.
    configArgs: [
      ...(options.entry === 'qilin' ? ['--profile', 'qilin'] : ['web']),
      // A harness never asks the deployment to open a browser: every hub this
      // lane starts would otherwise put a window on the machine running it.
      '--no-open',
      '--port', '0', '--idle-ms', String(options.idleMs ?? IDLE_MILLISECONDS),
      ...(options.profile === undefined ? [] : ['--tenant-profile', options.profile]),
      ...(options.maxTenants === undefined ? [] : ['--max-tenants', String(options.maxTenants)]),
      ...(options.restartBackoffMs === undefined ? [] : ['--restart-backoff-ms', String(options.restartBackoffMs)]),
      ...(options.perAccountPorts === true ? ['--per-account-ports'] : []),
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

/**
 * Enter one account's runtime through the deployment address.
 *
 * The address draws no page of its own: it forwards to the application inside
 * that account, whose own landing page and sign-in form a visitor then uses.
 * @param base - the deployment's origin, with a trailing slash.
 * @param username - the account whose path to open.
 * @returns the cookies the deployment set, routing cookie included.
 */
async function enterAccount(base: string, username: string): Promise<string> {
  const response = await fetch(`${base}t/${username}`, { redirect: 'manual' })
  expect(response.status, `entry for ${username}`).toBe(200)
  const cookies = response.headers.getSetCookie().map(value => value.split(';', 1)[0])
  if (!cookies.join('; ').includes('qilin_tenant')) throw new Error(`entering ${username} set no routing cookie`)
  return cookies.join('; ')
}

/**
 * Sign one account in through the deployment address, with the application's
 * own endpoint.
 * @param base - the deployment's origin, with a trailing slash.
 * @param cookie - the cookies that entered the account's path.
 * @param identifier - username or email address to submit.
 * @param password - password to submit.
 * @returns the entering cookies plus the session cookie the answer set.
 */
async function signInThroughAddress(base: string, cookie: string, identifier: string, password: string): Promise<string> {
  const response = await fetch(`${base}api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: new URL(base).origin, cookie },
    body: JSON.stringify({ identifier, password }),
  })
  expect(response.status, `sign-in for ${identifier}`).toBe(200)
  const session = response.headers.getSetCookie().map(value => value.split(';', 1)[0])
  if (session.length === 0) throw new Error(`the sign-in for ${identifier} set no session cookie`)
  return [cookie, ...session].join('; ')
}

/** Enter and sign in the way a browser does, in one call. */
async function signedInBrowser(base: string, username: string, password: string): Promise<string> {
  return await signInThroughAddress(base, await enterAccount(base, username), username, password)
}
/**
 * The runtime origin the deployment reports for one account.
 * @param base - the deployment's origin, with a trailing slash.
 * @param username - the account to look up.
 * @returns the origin of that account's runtime.
 * @throws Error when the deployment reports no running runtime for the account.
 */
async function runtimeOrigin(base: string, username: string): Promise<string> {
  const origin = (await hubStatus(base)).find(tenant => tenant.username === username)?.origin
  if (origin === undefined) throw new Error(`the deployment reported no runtime origin for ${username}`)
  return origin
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

    // 1. The deployment draws no interface of its own. The bare address hands
    //    the browser to an account's runtime, which serves the application's
    //    own landing page, sign-in document, and registration.
    const index = await fetch(base, { redirect: 'manual' })
    expect(index.status).toBe(302)
    expect(index.headers.get('location')).toBe('/t/alice/')
    expect(await index.text()).toBe('')

    // A wrong password is refused by the application behind the address, which
    // mints no session for it and reveals neither which accounts exist nor
    // which one was close.
    const refusedEntry = await enterAccount(base, 'alice')
    const refused = await fetch(`${base}api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: new URL(base).origin, cookie: refusedEntry },
      body: JSON.stringify({ identifier: 'alice', password: 'not-her-password' }),
    })
    expect(refused.status).toBe(401)
    expect(refused.headers.getSetCookie().some(cookie => cookie.startsWith('qilin-session-'))).toBe(false)

    // 2. Each account signs in at that one address and lands on a runtime of its
    // own, under the shared home.
    const aliceBrowser = await signedInBrowser(base, 'alice', ALICE_PASSWORD)
    const bobBrowser = await signedInBrowser(base, 'bob', BOB_PASSWORD)
    expect(aliceBrowser).not.toBe(bobBrowser)
    const aliceOrigin = await runtimeOrigin(base, 'alice')
    const bobOrigin = await runtimeOrigin(base, 'bob')
    lastOrigin = bobOrigin
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
    // signing in again starts a runtime of its own over the same tenant directory.
    await expect.poll(
      async () => (await hubStatus(base)).map(tenant => tenant.state),
      { timeout: 30_000, interval: 250 },
    ).toEqual(['stopped', 'stopped'])
    await signedInBrowser(base, 'alice', ALICE_PASSWORD)
    const againOrigin = await runtimeOrigin(base, 'alice')
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

    // 2. Signing a second account in past the cap reclaims the least recently used one.
    await signedInBrowser(base, 'alice', ALICE_PASSWORD)
    const aliceOrigin = await runtimeOrigin(base, 'alice')
    await signedInBrowser(base, 'bob', BOB_PASSWORD)
    const bobOrigin = await runtimeOrigin(base, 'bob')
    lastOrigin = bobOrigin
    expect(aliceOrigin).not.toBe(bobOrigin)
    expect(boundedHub.output()).toMatch(/reclaiming/u)
    const capped = await hubStatusDocument(base)
    expect(capped.alive).toBe(1)
    expect(capped.tenants.map(tenant => [tenant.username, tenant.state])).toEqual([['alice', 'stopped'], ['bob', 'running']])

    // 3. Signing alice in again reclaims bob, so the bound holds whichever way it moves.
    await signedInBrowser(base, 'alice', ALICE_PASSWORD)
    const aliceAgain = await runtimeOrigin(base, 'alice')
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
  // A second account exists in the shared file, so a routing cookie that names
  // it can be pointed at the first account's credentials.
  const bob = await store.add({ username: 'bob' }, BOB_PASSWORD)

  let hub: RunningHub | undefined
  try {
    hub = await startHub(root, home)
    const base = hub.base
    const hubOrigin = new URL(base).origin
    expect((await hubStatusDocument(base)).mode).toBe('single-origin')

    // 1. Signing in never leaves the hub origin: the account's own runtime
    //    checks the credentials through the hop, and the hub adds the routing
    //    cookie that names that account for every later request.
    const handoffResponse = await fetch(`${base}t/alice`, { redirect: 'manual' })
    expect(handoffResponse.status).toBe(200)
    expect(handoffResponse.headers.get('location')).toBeNull()
    const setCookies = handoffResponse.headers.getSetCookie()
    expect(setCookies.some(cookie => cookie.startsWith(`qilin_tenant=${alice.id}`))).toBe(true)
    const jar = setCookies
      .filter(cookie => cookie.startsWith('qilin_tenant='))
      .map(cookie => cookie.split(';', 1)[0])
      .join('; ')
    expect(jar).toMatch(/qilin_tenant=/u)

    // 2. The device cookie alone reaches the account gate, not the application:
    //    the hop forwards the gate's own redirect, so a browser is sent to the
    //    sign-in surface exactly as it would be at the runtime's own origin.
    const gated = await fetch(`${base}workspace`, { headers: { cookie: jar }, redirect: 'manual' })
    expect(gated.status).toBe(302)
    expect(gated.headers.get('location')).toBe('/?next=%2Fworkspace')

    // That redirect names the runtime's own root, and the application's landing
    // page lives there: a browser that already entered an account reaches the
    // application, and one that has not is told where an account lives.
    const landing = await fetch(base, { headers: { cookie: jar } })
    expect(landing.status).toBe(200)
    expect(await landing.text()).not.toContain('type="password"')
    const signin = await fetch(base, { redirect: 'manual' })
    expect(signin.status).toBe(302)
    expect(signin.headers.get('location')).toBe('/t/alice/')
    // The application's own sign-in document is what the account path serves.
    const signInDocument = await fetch(`${base}t/alice/login`, { redirect: 'manual' })
    expect(signInDocument.status).toBe(200)
    expect(await signInDocument.text()).toContain('type="password"')

    // A wrong password is refused by the application, which mints no session.
    const refusedPassword = await fetch(`${base}api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: hubOrigin, cookie: jar },
      body: JSON.stringify({ identifier: 'alice', password: 'wrong-password' }),
    })
    expect(refusedPassword.status).toBe(401)
    expect(refusedPassword.headers.getSetCookie().some(cookie => cookie.startsWith('qilin-session-'))).toBe(false)

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

    // 4. Signed in, the application document arrives at the hub root: /workspace
    //    is an absolute path that only the routing cookie can attribute.
    const document = await fetch(`${base}workspace`, { headers: { cookie: authenticated }, redirect: 'manual' })
    expect(document.status).toBe(200)
    expect(document.headers.get('content-type') ?? '').toContain('text/html')
    const html = await document.text()
    expect(html).toContain('<html')
    expect(html).not.toContain('next=%2Fworkspace')

    // The shell's own script and style references are absolute paths too, so
    // the page a browser loads would stall at the first one if the routing
    // cookie did not cover them. The attribute values are HTML-escaped.
    const assets = [
      ...[...html.matchAll(/<script[^>]+src="([^"]+)"/gu)].map(match => match[1] as string),
      ...[...html.matchAll(/<link[^>]+href="([^"]+)"/gu)].map(match => match[1] as string),
    ].map(asset => asset.replaceAll('&amp;', '&'))
    expect(assets.length).toBeGreaterThan(0)
    // The shell references them relative to the document, exactly as a browser
    // resolves them against the page URL.
    const documentUrl = `${hubOrigin}/workspace`
    for (const asset of new Set(assets).values()) {
      const served = await fetch(new URL(asset, documentUrl), { headers: { cookie: authenticated } })
      expect(served.status, asset).toBe(200)
      // Not the hub's own page: the runtime answered the asset itself.
      expect(served.headers.get('content-type') ?? '', asset).not.toContain('text/html')
    }

    // 5. A ranged media read crosses the hop with its window and headers
    //    intact: /sidebar/media is the host route the video preview seeks
    //    through, so 206 and Content-Range are what a viewer depends on.
    const mediaDir = join(root, 'alice-media')
    await mkdir(mediaDir, { recursive: true })
    const clip = join(mediaDir, 'clip.mp4')
    const clipBytes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd'
    await writeFile(clip, clipBytes)
    const mediaSession = await remote<{ sessionId: string }>(hubOrigin, authenticated, 'session/create', { request: { cwd: mediaDir } })
    const mediaUrl = `${hubOrigin}/sidebar/media?sessionId=${mediaSession.sessionId}&path=${encodeURIComponent(clip)}`
    const ranged = await fetch(mediaUrl, { headers: { cookie: authenticated, range: 'bytes=5-14' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('content-range')).toBe('bytes 5-14/40')
    expect(ranged.headers.get('accept-ranges')).toBe('bytes')
    expect(await ranged.text()).toBe('FGHIJKLMNO')
    const whole = await fetch(mediaUrl, { headers: { cookie: authenticated } })
    expect(whole.status).toBe(200)
    expect(await whole.text()).toBe(clipBytes)

    // 6. A Remote request and the mux upgrade cross the hop too: the upgrade
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

    // 7. The routing cookie selects a tenant and authorizes nothing. Pointing
    //    the signed-in jar at the other account's runtime reaches that
    //    runtime's own gate, which does not recognize a session it never minted.
    const confused = await fetch(`${hubOrigin}/api/session/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: hubOrigin,
        cookie: `qilin_tenant=${bob.id}; ${accountCookies.join('; ')}`,
      },
      body: JSON.stringify({ type: 'client-request', rpcId: 'confused', method: 'session/list', payload: { args: { _request: {} } } }),
      redirect: 'manual',
    })
    expect(confused.status).toBe(401)

    // 8. Reclamation counts proxied traffic rather than a handoff: requests
    //    spread across the idle window keep the runtime alive...
    const until = Date.now() + IDLE_MILLISECONDS + 3000
    while (Date.now() < until) {
      const status = await fetch(`${base}api/auth/status`, { headers: { cookie: authenticated } })
      expect(status.status).toBe(200)
      await new Promise(resolve => setTimeout(resolve, 1200))
    }
    expect((await hubStatus(base)).find(tenant => tenant.username === 'alice')?.state).toBe('running')

    // ... and stop counting the moment the browser does, for every runtime the
    // scenario touched: alice's and the one the confused selector started.
    await expect.poll(
      async () => (await hubStatus(base)).map(tenant => [tenant.username, tenant.state]),
      { timeout: 30_000, interval: 250 },
    ).toEqual([['alice', 'stopped'], ['bob', 'stopped']])

    // 9. Signing out ends the runtime's own session and clears this deployment's
    //    routing cookie on the same answer, so the browser is back at the form.
    const bobBrowser = await signedInBrowser(base, 'bob', BOB_PASSWORD)
    const logout = await fetch(`${base}api/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: hubOrigin, cookie: bobBrowser },
      body: '{}',
      redirect: 'manual',
    })
    expect(logout.status).toBeLessThan(400)
    expect(logout.headers.getSetCookie().some(cookie => cookie.startsWith('qilin_tenant=;'))).toBe(true)
  } catch (error) {
    const evidence = hub === undefined ? '' : `\n${hub.output().slice(-4000)}`
    throw new Error(`${error instanceof Error ? error.message : String(error)}${evidence}`, { cause: error })
  } finally {
    if (hub !== undefined) await stopHub(hub)
    await rm(root, { recursive: true, force: true })
  }
})

it('runs two accounts at once through the product profile', { timeout: 240_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'qilin-tenant-concurrent-'))
  const home = join(root, 'home')
  await mkdir(home, { recursive: true })
  const store = await AccountStore.open(accountsFilePath(home))
  await store.add({ username: 'linbid' }, ALICE_PASSWORD)
  await store.add({ username: 'kkutys' }, BOB_PASSWORD)

  let hub: RunningHub | undefined
  try {
    // The product profile is a deployment too: the user's own entry, not a
    // second command.
    hub = await startHub(root, home, { entry: 'qilin' })
    const base = hub.base
    // Requests address the origin without the trailing slash the page URL carries.
    const hubOrigin = new URL(base).origin
    const linbid = await signedInBrowser(base, 'linbid', ALICE_PASSWORD)
    const kkutys = await signedInBrowser(base, 'kkutys', BOB_PASSWORD)

    // Both runtimes are alive at the same time; neither replaced the other.
    const status = await hubStatus(base)
    expect(status.map(tenant => [tenant.username, tenant.state]))
      .toEqual([['linbid', 'running'], ['kkutys', 'running']])

    const work = async (name: string): Promise<string> => {
      const dir = join(root, `${name}-work`)
      await mkdir(dir, { recursive: true })
      return dir
    }
    const [linbidCwd, kkutysCwd] = await Promise.all([work('linbid'), work('kkutys')])
    const created = await Promise.all([
      remote<{ sessionId: string }>(hubOrigin, linbid, 'session/create', { request: { cwd: linbidCwd } }),
      remote<{ sessionId: string }>(hubOrigin, kkutys, 'session/create', { request: { cwd: kkutysCwd } }),
    ])
    // Interleaved reads, driven at the same time: each account sees its own
    // Session and never the other's.
    const reads = await Promise.all(Array.from({ length: 3 }, () => [
      remote<{ items: { sessionId: string }[] }>(hubOrigin, linbid, 'session/list', { _request: {} }),
      remote<{ items: { sessionId: string }[] }>(hubOrigin, kkutys, 'session/list', { _request: {} }),
    ]).flat())
    for (const [index, read] of reads.entries()) {
      const mine = read.items.map(item => item.sessionId)
      const owner = index % 2 === 0 ? created[0] : created[1]
      const foreign = index % 2 === 0 ? created[1] : created[0]
      expect(mine).toContain(owner.sessionId)
      expect(mine).not.toContain(foreign.sessionId)
    }
    // A model setting one of them writes stays in that account's own home.
    await remote(hubOrigin, linbid, 'settings/update', { ns: 'ui-theme', patch: { fontSize: 16 }, expectedRevision: 0 })
    const describe = async (cookie: string): Promise<number | undefined> => {
      const answer = await remote<{ namespaces: { ns: string; value: { fontSize?: number } }[] }>(hubOrigin, cookie, 'settings/describe', {})
      return answer.namespaces.find(entry => entry.ns === 'ui-theme')?.value.fontSize
    }
    expect(await describe(linbid)).toBe(16)
    expect(await describe(kkutys)).not.toBe(16)
  } catch (error) {
    const evidence = hub === undefined ? '' : `\n${hub.output().slice(-4000)}`
    throw new Error(`${error instanceof Error ? error.message : String(error)}${evidence}`, { cause: error })
  } finally {
    if (hub !== undefined) await stopHub(hub)
    await rm(root, { recursive: true, force: true })
  }
})

it('keeps every runtime when the idle window is 0', { timeout: 240_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'qilin-tenant-no-idle-'))
  const home = join(root, 'home')
  await mkdir(home, { recursive: true })
  const store = await AccountStore.open(accountsFilePath(home))
  await store.add({ username: 'alice' }, ALICE_PASSWORD)

  let hub: RunningHub | undefined
  try {
    hub = await startHub(root, home, { idleMs: 0 })
    await signedInBrowser(hub.base, 'alice', ALICE_PASSWORD)
    // A sweep interval sized from 0 would reclaim each runtime on its first
    // tick; the window of 0 means no sweep at all.
    await new Promise(resolve => setTimeout(resolve, 2500))
    const state = (await hubStatus(hub.base)).find(tenant => tenant.username === 'alice')?.state
    expect(state).toBe('running')
  } catch (error) {
    const evidence = hub === undefined ? '' : `\n${hub.output().slice(-4000)}`
    throw new Error(`${error instanceof Error ? error.message : String(error)}${evidence}`, { cause: error })
  } finally {
    if (hub !== undefined) await stopHub(hub)
    await rm(root, { recursive: true, force: true })
  }
})

it('gives every account its own origin so one browser can hold two accounts', { timeout: 240_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'qilin-tenant-origins-'))
  const home = join(root, 'home')
  await mkdir(home, { recursive: true })
  const store = await AccountStore.open(accountsFilePath(home))
  await store.add({ username: 'alice' }, ALICE_PASSWORD)
  await store.add({ username: 'bob' }, BOB_PASSWORD)

  let hub: RunningHub | undefined
  try {
    hub = await startHub(root, home, { perAccountPorts: true })
    const base = hub.base

    // The deployment's own address is an index, not an application: it hands
    // the browser to an account, and that account lives on an origin of its
    // own, so its cookies cannot be shared with any other account.
    const index = await fetch(base, { redirect: 'manual' })
    expect(index.status).toBe(302)
    expect(index.headers.get('location')).toBe('/t/alice/')
    const aliceHandoff = await fetch(`${base}t/alice/`, { redirect: 'manual' })
    expect(aliceHandoff.status).toBe(303)
    const bobHandoff = await fetch(`${base}t/bob/`, { redirect: 'manual' })
    expect(bobHandoff.status).toBe(303)
    const aliceOrigin = new URL(aliceHandoff.headers.get('location') as string).origin
    const bobOrigin = new URL(bobHandoff.headers.get('location') as string).origin
    expect(aliceOrigin).not.toBe(bobOrigin)
    expect(aliceOrigin).not.toBe(new URL(base).origin)
    // No launch token rides the redirect: the account's own gate asks for
    // credentials, which is what makes the two origins independent sessions.
    expect(aliceHandoff.headers.get('location')).not.toContain('token=')

    // Two browsers, one account each: the sessions do not cross, which is the
    // whole point of giving every account an origin.
    const aliceCookie = await login(aliceOrigin, 'alice', ALICE_PASSWORD)
    const bobCookie = await login(bobOrigin, 'bob', BOB_PASSWORD)
    const aliceWork = join(root, 'origins-alice')
    await mkdir(aliceWork, { recursive: true })
    const aliceSession = await remote<{ sessionId: string }>(aliceOrigin, aliceCookie, 'session/create', { request: { cwd: aliceWork } })
    const aliceList = await remote<{ items: { sessionId: string }[] }>(aliceOrigin, aliceCookie, 'session/list', { _request: {} })
    const bobList = await remote<{ items: { sessionId: string }[] }>(bobOrigin, bobCookie, 'session/list', { _request: {} })
    expect(aliceList.items.map(item => item.sessionId)).toContain(aliceSession.sessionId)
    expect(bobList.items.map(item => item.sessionId)).not.toContain(aliceSession.sessionId)
  } catch (error) {
    const evidence = hub === undefined ? '' : `\n${hub.output().slice(-4000)}`
    throw new Error(`${error instanceof Error ? error.message : String(error)}${evidence}`, { cause: error })
  } finally {
    if (hub !== undefined) await stopHub(hub)
    await rm(root, { recursive: true, force: true })
  }
})

it('initializes a deployment that has no accounts yet through the product own form', { timeout: 240_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'qilin-tenant-first-run-'))
  const home = join(root, 'home')
  await mkdir(home, { recursive: true })

  let hub: RunningHub | undefined
  try {
    hub = await startHub(root, home)
    const base = hub.base

    // 1. The bare address serves the application, not a message from the
    //    deployment: the product's own page is what a fresh install shows.
    const front = await fetch(base)
    expect(front.status).toBe(200)
    const firstRun = await front.text()
    expect(firstRun).toContain('<html')
    expect(firstRun).not.toContain('qilin tenants')

    // 2. The product's own status read reaches the first-run runtime and asks
    //    for initialization.
    const status = await fetch(`${base}api/auth/status`)
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({ enabled: true, needsSetup: true, authenticated: false })

    // 3. The product's own form creates the first account, writing the shared
    //    roster the deployment reads.
    const created = await fetch(`${base}api/auth/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: FIRST_RUN, password: FIRST_RUN_PASSWORD }),
    })
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({ user: { username: FIRST_RUN } })
    const roster = await AccountStore.open(accountsFilePath(home))
    expect(roster.byUsername(FIRST_RUN)?.username).toBe(FIRST_RUN)

    // 4. From then on the deployment routes to that account's own runtime, and
    //    the first-run runtime is one directory beside it rather than a stray
    //    copy of the deployment's state.
    const routed = await fetch(base, { redirect: 'manual' })
    expect(routed.status).toBe(302)
    expect(routed.headers.get('location')).toBe(`/t/${FIRST_RUN}/`)
    const served = await fetch(`${base}t/${FIRST_RUN}/`)
    expect(served.status).toBe(200)
    expect(await served.text()).toContain('<html')
    expect(await readdir(join(home, 'tenants'))).toEqual(expect.arrayContaining([BOOTSTRAP_DIRECTORY]))
    expect(await readdir(home)).toEqual(['auth', 'tenants'])

    // 5. A deployment that accepts accounts lets the product create the next
    //    one: the name is unknown to the roster, so the application answers that
    //    path, and the register call it serves adds the account.
    const arriving = await fetch(`${base}t/${SECOND_USER}/`)
    expect(arriving.status).toBe(200)
    expect(await arriving.text()).toContain('<html')
    const registered = await fetch(`${base}api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: SECOND_USER, password: SECOND_USER_PASSWORD }),
    })
    expect(registered.status).toBe(200)
    expect(await registered.json()).toMatchObject({ user: { username: SECOND_USER } })
    const secondPath = await fetch(`${base}t/${SECOND_USER}/`)
    expect(secondPath.status).toBe(200)
    expect(await secondPath.text()).toContain('<html')

    // 6. A browser that still carries an account this roster does not hold is a
    //    new arrival, not an error: the routing cookie is dropped and the
    //    application answers. Answering a deployment error here would put this
    //    process between a browser and the application.
    const retired = await fetch(base, {
      headers: { cookie: 'qilin_tenant=11111111-1111-1111-1111-111111111111' },
      redirect: 'manual',
    })
    expect(retired.status).toBe(302)
    expect(retired.headers.get('location')).toBe(`/t/${FIRST_RUN}/`)
    expect(retired.headers.getSetCookie().some(cookie => cookie.startsWith('qilin_tenant=;'))).toBe(true)
  } catch (error) {
    const evidence = hub === undefined ? '' : `\n${hub.output().slice(-4000)}`
    throw new Error(`${error instanceof Error ? error.message : String(error)}${evidence}`, { cause: error })
  } finally {
    if (hub !== undefined) await stopHub(hub)
    await rm(root, { recursive: true, force: true })
  }
})
