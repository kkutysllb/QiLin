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
import { sessionIdsUnder, tenantRemoteResult } from './tenant-web-process.ts'

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
}

/** Start the hub over one shared home and wait for its URL. */
async function startHub(root: string, home: string): Promise<RunningHub> {
  const launch = resolveExampleLaunch({
    srcBin: join(repoRoot, 'apps/cli/src/bin.ts'),
    mode: 'lib',
    configArgs: ['tenants', 'serve', '--port', '0', '--idle-ms', String(IDLE_MILLISECONDS)],
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
  const response = await fetch(`${base}status`)
  if (response.status !== 200) throw new Error(`the hub's status read answered ${String(response.status)}`)
  return (await response.json() as { tenants: TenantStatus[] }).tenants
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
