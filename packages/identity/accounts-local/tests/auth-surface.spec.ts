/**
 * REAL-composition coverage: a test-only cordis.yml booted through the
 * vendored Loader mounts the webserver, credentials, connection,
 * frontend-static, and accounts rows, and every assertion observes the served
 * HTTP surface — the public documents, the gated application entry, the
 * authentication endpoints, the /api session gate, the launch-token handoff,
 * and the state a failed boot or a disposed row leaves behind.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, FiberState } from '@qilin/kylin'
import Loader from '@qilin/kylin-plugin-loader'
import Include from '@qilin/kylin-plugin-include'
import * as Accounts from '../src/index.ts'
import { SessionCookies } from '../src/session.ts'
import * as Connection from '@qilin/client-connection'
import type { ConnectionSessionAuthority } from '@qilin/client-connection'
import LocalCredentials from '@qilin/credentials-local'
import HttpServer from '@qilin/host-webserver'
import * as FrontendStatic from '@qilin/host-frontend-static'

const SESSION_SECRET_KEY = 'accounts-local/session-secret'
const PASSWORD = 'password-1'
const EMAIL = 'first@example.com'

interface Booted {
  readonly ctx: Context
  readonly base: string
  readonly credentialsPath: string
  /** Issue one request against the booted server. */
  (path: string, init?: RequestInit): Promise<Response>
}

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 3 })
})

/** Boot one real composition over a dist fixture. */
async function boot(options: {
  enabled?: boolean
  registration?: 'open' | 'closed'
  secret?: string
  /** Raw record lines for the session-secret entry, when a test seeds a broken one. */
  record?: readonly string[]
} = {}): Promise<Booted> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-accounts-surface-'))
  roots.push(root)
  const dist = join(root, 'dist')
  const home = join(root, 'home')
  await mkdir(dist, { recursive: true })
  await mkdir(home, { recursive: true })
  await writeFile(join(dist, 'index.html'), '<head></head><body>shell</body>')
  await writeFile(join(dist, 'landing.html'), '<head></head><body>landing</body>')
  await writeFile(join(dist, 'auth.html'), '<head></head><body>sign in</body>')
  const credentialsPath = join(root, '.credentials.yaml')
  if (options.secret !== undefined || options.record !== undefined) {
    const record = options.record
      ?? ['kind: grant', 'payload:', '  version: 1', `  secret: ${options.secret as string}`]
    const document = ['version: 1', 'records:', `  ${SESSION_SECRET_KEY}:`, ...record.map(line => `    ${line}`)]
    await writeFile(credentialsPath, `${document.join('\n')}\n`, { mode: 0o600 })
  }
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@qilin/credentials-local'",
    '  config:',
    `    path: '${credentialsPath}'`,
    '    watch: false',
    "- name: '@qilin/host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@qilin/client-connection'",
    '- id: frontend',
    "  name: '@qilin/host-frontend-static'",
    '  config:',
    `    distIndex: '${join(dist, 'index.html')}'`,
    "    indexPaths: ['/workspace', '/index.html']",
    '    documents:',
    "      - { path: '/', file: 'landing.html' }",
    "      - { path: '/login', file: 'auth.html' }",
    '- id: accounts',
    "  name: '@qilin/accounts-local'",
    '  config:',
    `    enabled: ${options.enabled === false ? 'false' : 'true'}`,
    `    registration: ${options.registration ?? 'open'}`,
    `    qilinHome: '${home}'`,
    '',
  ].join('\n'))

  const ctx = new Context()
  contexts.push(ctx)
  ctx.baseUrl = pathToFileURL(root).href + '/'
  ctx.provide('qilinHomePath', () => home)
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@qilin/credentials-local', LocalCredentials],
    ['@qilin/host-webserver', HttpServer],
    ['@qilin/client-connection', Connection],
    ['@qilin/host-frontend-static', FrontendStatic],
    ['@qilin/accounts-local', Accounts],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  // A row that failed to activate still lets the Loader settle, so the helper
  // reports it with the reason the row recorded: a composition that cannot
  // serve its rows is not a booted server.
  const failed = await inactiveReasons(ctx)
  if (failed.length > 0) throw new Error(`accounts surface fixture: rows not active: ${failed.join('; ')}`)
  const port = ctx.get('webServer')?.port
  if (port === undefined) throw new Error('accounts surface fixture: webServer missing after boot')
  const base = `http://127.0.0.1:${String(port)}`
  return Object.assign(
    (path: string, init: RequestInit = {}): Promise<Response> => fetch(new URL(path, base), init),
    { ctx, base, credentialsPath },
  )
}

/** Names of loader rows that did not reach ACTIVE. */
function inactive(ctx: Context): string[] {
  return [...ctx.loader.entries()]
    .filter(entry => !entry.disabled && entry.fiber?.state !== FiberState.ACTIVE)
    .map(entry => entry.options.name)
}

/**
 * Every row that did not reach ACTIVE, with the reason it recorded.
 * @param ctx - the booted context.
 * @returns one `name: reason` line per inactive row.
 */
async function inactiveReasons(ctx: Context): Promise<string[]> {
  const lines: string[] = []
  for (const entry of ctx.loader.entries()) {
    const fiber = entry.fiber
    if (entry.disabled || fiber === undefined || fiber.state === FiberState.ACTIVE) continue
    try {
      await fiber.await()
      lines.push(`${entry.options.name}: fiber state ${String(fiber.state)}`)
    } catch (error) {
      lines.push(`${entry.options.name}: ${(error as Error).message}`)
    }
  }
  return lines
}

/** The session cookie one response set, as a Cookie request header pair. */
function cookieOf(response: Response): string {
  const header = response.headers.get('set-cookie')
  if (header === null) throw new Error('expected a session cookie')
  return header.split(';', 1)[0] as string
}

/** POST one JSON body with the given cookies. */
function post(cookie: string | undefined, body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cookie === undefined ? {} : { cookie } },
    body: JSON.stringify(body),
  }
}

/** The signing secret this composition stored, read back from the credential file. */
async function storedSecret(path: string): Promise<string> {
  const match = /^\s+secret:\s*(\S+)$/mu.exec(await readFile(path, 'utf8'))
  if (match === null || match[1] === undefined) throw new Error('expected a stored session secret')
  return match[1]
}

describe('real account surface', () => {
  it('serves the public documents, gates the entry, and keeps the token handoff', { timeout: 60_000 }, async () => {
    const server = await boot()
    expect(inactive(server.ctx)).toEqual([])

    // Public documents need no session and anchor their assets at the site root.
    const landing = await server('/')
    expect(landing.status).toBe(200)
    const landingBody = await landing.text()
    expect(landingBody).toContain('<base href="/">')
    expect(landingBody).toContain('landing')
    const signIn = await server('/login')
    expect(signIn.status).toBe(200)
    expect(await signIn.text()).toContain('sign in')

    // The application entry hands an unauthenticated visitor the public page,
    // which owns the way in and keeps the requested path to return to.
    const entry = await server('/workspace', { redirect: 'manual' })
    expect(entry.status).toBe(302)
    expect(entry.headers.get('location')).toBe('/?next=%2Fworkspace')
    expect((await server('/index.html', { redirect: 'manual' })).headers.get('location'))
      .toBe('/?next=%2Findex.html')

    // The launch-token handoff still cleans the printed URL into the entry path.
    const handoff = await fetch(server.ctx.connection.authenticatedUrl(server.base), { redirect: 'manual' })
    expect(handoff.status).toBe(303)
    expect(handoff.headers.get('location')).toBe('/workspace')

    // /api answers the authentication surface without a session and refuses the rest.
    expect((await server('/api/auth/status')).status).toBe(200)
    expect((await server('/api/anything')).status).toBe(401)
    expect((await server('/api/anything', { headers: { cookie: 'other=1' } })).status).toBe(401)
  })

  it('initializes the first account, signs in, and retires the session a credential change replaces', { timeout: 60_000 }, async () => {
    const server = await boot()

    const setup = await server('/api/auth/setup', post(undefined, { username: 'first', email: EMAIL, password: PASSWORD }))
    expect(setup.status).toBe(200)
    const session = cookieOf(setup)
    // A configured default of seven days, absolute.
    expect(setup.headers.get('set-cookie')).toContain('Max-Age=604800')
    expect(await setup.json()).toMatchObject({ user: { username: 'first', email: EMAIL } })

    // The session reaches the gated entry and the status read.
    const entry = await server('/workspace', { headers: { cookie: session } })
    expect(entry.status).toBe(200)
    const entryBody = await entry.text()
    expect(entryBody).toContain('<base href="/">')
    expect(entryBody).toContain('shell')
    const status = await server('/api/auth/status', { headers: { cookie: session } })
    expect(await status.json()).toMatchObject({
      enabled: true, needsSetup: false, registrationOpen: true, authenticated: true,
      user: { username: 'first', email: EMAIL },
    })
    // A gated /api request answers 404 for an unknown endpoint rather than 401.
    expect(await (await server('/api/anything', { headers: { cookie: session } })).text()).toBe('not found')

    // Both spellings of the identifier sign in again: the name and the address.
    const login = await server('/api/auth/login', post(undefined, { identifier: 'first', password: PASSWORD }))
    expect(login.status).toBe(200)
    expect(cookieOf(login)).toContain('qilin-session-')

    // Changing the password bumps the credential generation: the old cookie and
    // the old password both stop working, and the address can move with it.
    const changed = await server('/api/auth/change-password', post(session, {
      currentPassword: PASSWORD,
      newPassword: 'password-2',
      username: 'renamed',
      email: 'renamed@example.com',
    }))
    expect(changed.status).toBe(200)
    expect(await changed.json()).toMatchObject({ user: { username: 'renamed', email: 'renamed@example.com' } })
    expect((await server('/workspace', { redirect: 'manual', headers: { cookie: session } })).headers.get('location'))
      .toBe('/?next=%2Fworkspace')
    expect((await server('/api/auth/login', post(undefined, { identifier: 'first', password: PASSWORD }))).status).toBe(401)
    expect((await server('/api/auth/login', post(undefined, { identifier: EMAIL, password: PASSWORD }))).status).toBe(401)
    expect((await server('/api/auth/login', post(undefined, { identifier: 'renamed', password: 'password-2' }))).status)
      .toBe(200)

    // A change without an address keeps the stored one.
    const secondChange = await server('/api/auth/change-password', post(cookieOf(changed), {
      currentPassword: 'password-2',
      newPassword: 'password-3',
    }))
    expect(secondChange.status).toBe(200)
    expect(await secondChange.json()).toMatchObject({ user: { username: 'renamed', email: 'renamed@example.com' } })

    // Signing out clears the cookie.
    const logout = await server('/api/auth/logout', { method: 'POST', headers: { cookie: session } })
    expect(logout.status).toBe(204)
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('answers registration according to the deployment choice', { timeout: 60_000 }, async () => {
    const open = await boot()
    const created = await open('/api/auth/register', post(undefined, { username: 'second', email: 'second@example.com', password: PASSWORD }))
    expect(created.status).toBe(200)
    const second = cookieOf(created)
    // A second account reaches the same harness home.
    expect((await open('/workspace', { headers: { cookie: second } })).status).toBe(200)
    // Both uniqueness rules answer with the field that collided.
    expect(await (await open('/api/auth/register', post(undefined, { username: 'second', password: PASSWORD }))).json())
      .toMatchObject({ error: { code: 'username-taken' } })
    expect(await (await open('/api/auth/register', post(undefined, {
      username: 'third', email: 'second@example.com', password: PASSWORD,
    }))).json()).toMatchObject({ error: { code: 'email-taken' } })
    // An account with no address is a complete account.
    expect((await open('/api/auth/register', post(undefined, { username: 'nameless', password: PASSWORD }))).status).toBe(200)
    // First-run initialization is refused once any account exists.
    const lateSetup = await open('/api/auth/setup', post(undefined, { username: 'third', email: 'third@example.com', password: PASSWORD }))
    expect(lateSetup.status).toBe(409)
    expect(await lateSetup.json()).toMatchObject({ error: { code: 'already-initialized' } })

    const closed = await boot({ registration: 'closed' })
    const refused = await closed('/api/auth/register', post(undefined, { username: 'second', password: PASSWORD }))
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: { code: 'registration-closed' } })
    expect(await (await closed('/api/auth/status')).json()).toMatchObject({ registrationOpen: false, needsSetup: true })
  })

  it('refuses every credential the endpoints cannot accept', { timeout: 60_000 }, async () => {
    const server = await boot()
    const raw = (body: BodyInit | undefined): RequestInit => ({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...body === undefined ? {} : { body },
    })

    // Malformed bodies, before anything is written.
    expect(await (await server('/api/auth/setup', raw('{'))).json()).toMatchObject({ error: { code: 'invalid-body' } })
    expect(await (await server('/api/auth/setup', raw('[]'))).json()).toMatchObject({ error: { code: 'invalid-body' } })
    expect(await (await server('/api/auth/setup', raw('{"username":""}'))).json())
      .toMatchObject({ error: { code: 'invalid-body' } })
    expect(await (await server('/api/auth/setup', raw(JSON.stringify({ username: 'first', password: PASSWORD, email: 7 })))).json())
      .toMatchObject({ error: { code: 'invalid-body' } })
    expect(await (await server('/api/auth/setup', raw('{"username":"a","password":"password-1"}'))).json())
      .toMatchObject({ error: { code: 'invalid-username' } })
    expect(await (await server('/api/auth/setup', raw(JSON.stringify({ username: 'first', email: 'a@b', password: PASSWORD })))).json())
      .toMatchObject({ error: { code: 'invalid-email' } })
    expect(await (await server('/api/auth/setup', raw(JSON.stringify({ username: 'first', password: 'short' })))).json())
      .toMatchObject({ error: { code: 'password-too-short' } })
    // Every endpoint that takes a body applies the same input rules.
    expect(await (await server('/api/auth/register', raw('{'))).json()).toMatchObject({ error: { code: 'invalid-body' } })
    expect(await (await server('/api/auth/register', raw('{"username":""}'))).json()).toMatchObject({ error: { code: 'invalid-body' } })
    expect(await (await server('/api/auth/register', raw(JSON.stringify({ username: 'first', email: 'nope', password: PASSWORD })))).json())
      .toMatchObject({ error: { code: 'invalid-email' } })
    expect(await (await server('/api/auth/login', raw('{'))).json()).toMatchObject({ error: { code: 'invalid-body' } })
    expect(await (await server('/api/auth/login', raw('{"identifier":"first"}'))).json()).toMatchObject({ error: { code: 'invalid-body' } })
    // A disabled method on a registered path is not an endpoint.
    expect((await server('/api/auth/status', { method: 'POST' })).status).toBe(404)

    const setup = await server('/api/auth/setup', post(undefined, { username: 'first', email: EMAIL, password: PASSWORD }))
    const session = cookieOf(setup)

    // Sign-in refusals are indistinguishable between an unknown identifier and a wrong password.
    expect(await (await server('/api/auth/login', post(undefined, { identifier: 'nobody', password: PASSWORD }))).json())
      .toMatchObject({ error: { code: 'invalid-credentials' } })
    expect(await (await server('/api/auth/login', post(undefined, { identifier: EMAIL, password: 'password-9' }))).json())
      .toMatchObject({ error: { code: 'invalid-credentials' } })

    // Credential changes check the session, the current password, and both identity fields.
    expect((await server('/api/auth/change-password', post(undefined, { currentPassword: PASSWORD, newPassword: 'password-2' }))).status)
      .toBe(401)
    expect(await (await server('/api/auth/change-password', post(session, { currentPassword: PASSWORD }))).json())
      .toMatchObject({ error: { code: 'invalid-body' } })
    expect(await (await server('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: session },
      body: '{',
    })).json()).toMatchObject({ error: { code: 'invalid-body' } })
    expect(await (await server('/api/auth/change-password', post(session, { currentPassword: 'wrong-password', newPassword: 'password-2' }))).json())
      .toMatchObject({ error: { code: 'invalid-credentials' } })
    expect(await (await server('/api/auth/change-password', post(session, { currentPassword: PASSWORD, newPassword: 'short' }))).json())
      .toMatchObject({ error: { code: 'password-too-short' } })
    expect(await (await server('/api/auth/change-password', post(session, { currentPassword: PASSWORD, newPassword: 'password-2', email: 'nope' }))).json())
      .toMatchObject({ error: { code: 'invalid-email' } })
    expect(await (await server('/api/auth/change-password', post(session, {
      currentPassword: PASSWORD, newPassword: 'password-2', username: 'X',
    }))).json()).toMatchObject({ error: { code: 'invalid-username' } })
    await server('/api/auth/register', post(undefined, { username: 'second', email: 'second@example.com', password: PASSWORD }))
    expect(await (await server('/api/auth/change-password', post(session, {
      currentPassword: PASSWORD, newPassword: 'password-2', email: 'second@example.com',
    }))).json()).toMatchObject({ error: { code: 'email-taken' } })
    expect(await (await server('/api/auth/change-password', post(session, {
      currentPassword: PASSWORD, newPassword: 'password-2', username: 'second',
    }))).json()).toMatchObject({ error: { code: 'username-taken' } })
    // An empty address clears the stored one; the account keeps its name.
    const cleared = await server('/api/auth/change-password', post(session, {
      currentPassword: PASSWORD, newPassword: 'password-2', email: '',
    }))
    expect(cleared.status).toBe(200)
    expect(await cleared.json()).toMatchObject({ user: { username: 'first', email: null } })

  })

  it('refuses a request that names no authority', { timeout: 60_000 }, async () => {
    const server = await boot()
    const shared = server.ctx.connection.createSharedFetchHandler('/api')
    const anonymousPost = (path: string, body: unknown): Promise<Response> => shared.fetch(new Request(
      `http://qilin.invalid${path}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    ))
    for (const path of ['/api/auth/setup', '/api/auth/register', '/api/auth/login', '/api/auth/change-password']) {
      const response = await anonymousPost(path, { username: 'first', email: EMAIL, identifier: 'first', password: PASSWORD })
      expect(response.status, path).toBe(400)
      expect(await response.json(), path).toMatchObject({ error: { code: 'invalid-authority' } })
    }
    // Nothing to clear without an authority, and status needs none.
    const logout = await shared.fetch(new Request('http://qilin.invalid/api/auth/logout', { method: 'POST' }))
    expect(logout.status).toBe(204)
    expect(logout.headers.get('set-cookie')).toBeNull()
    const status = await shared.fetch(new Request('http://qilin.invalid/api/auth/status'))
    expect(await status.json()).toMatchObject({ authenticated: false, user: null })
  })

  it('stops gating when the deployment disables it and releases the seat when disposed', { timeout: 60_000 }, async () => {
    const server = await boot({ enabled: false })
    // Without the gate the transport falls back to its launch-token cookie,
    // which every /api request including this one then needs.
    const handoff = await fetch(server.ctx.connection.authenticatedUrl(server.base), { redirect: 'manual' })
    const device = handoff.headers.get('set-cookie')?.split(';', 1)[0] as string
    expect(handoff.status).toBe(303)
    expect((await server('/api/auth/status')).status).toBe(401)
    expect(await (await server('/api/auth/status', { headers: { cookie: device } })).json())
      .toMatchObject({ enabled: false })
    expect((await server('/workspace', { headers: { cookie: device } })).status).toBe(200)
    expect((await server('/api/anything', { headers: { cookie: device } })).status).toBe(404)

    const gated = await boot()
    const setup = await gated('/api/auth/setup', post(undefined, { username: 'first', email: EMAIL, password: PASSWORD }))
    const session = cookieOf(setup)
    expect((await gated('/workspace', { headers: { cookie: session } })).status).toBe(200)

    // One seat: the installed authority cannot be replaced.
    const entry = [...gated.ctx.loader.entries()].find(candidate => candidate.options.id === 'accounts')
    const connection = gated.ctx.get('connection')
    if (connection === undefined || entry?.ctx === undefined) throw new Error('fixture: accounts row missing')
    const gate: ConnectionSessionAuthority = {
      authorizeIndex: () => true,
      isPublicApiRequest: () => false,
      verify: () => false,
    }
    // The mounted row already owns the seat, so a second authority cannot take it.
    expect(() => { connection.session.install(gate) }).toThrow(/already installed/u)

    // Disposing the row releases both the gate and its endpoints: the transport
    // returns to its launch-token policy and the auth paths stop matching.
    await entry.fiber?.dispose()
    expect((await gated('/api/auth/status')).status).toBe(401)
    expect((await gated('/workspace', { redirect: 'manual', headers: { cookie: session } })).status).toBe(401)
    const handoffAfter = await fetch(gated.ctx.connection.authenticatedUrl(gated.base), { redirect: 'manual' })
    const deviceAfter = handoffAfter.headers.get('set-cookie')?.split(';', 1)[0] as string
    expect((await gated('/workspace', { headers: { cookie: deviceAfter } })).status).toBe(200)
  })

  it('reuses a stored session secret and refuses one it cannot use', { timeout: 60_000 }, async () => {
    const valid = Buffer.alloc(32, 5).toString('base64url')
    const reusable = await boot({ secret: valid })
    expect(inactive(reusable.ctx)).toEqual([])
    expect(await storedSecret(reusable.credentialsPath)).toBe(valid)
    const created = await reusable('/api/auth/setup', post(undefined, { username: 'first', email: EMAIL, password: PASSWORD }))
    expect(created.status).toBe(200)

    // A padded spelling decodes to the same 32 bytes without being that byte
    // string's canonical encoding, and is refused as such.
    const nonCanonical = `${valid}=`
    for (const secret of ['not-a-secret!', Buffer.alloc(8, 1).toString('base64url'), nonCanonical]) {
      await expect(boot({ secret }), secret).rejects.toThrow(/stored session secret/u)
    }

    const records: readonly (readonly [string, readonly string[]])[] = [
      ['another record kind', ['kind: api-key', 'key: not-a-cookie-secret']],
      ['a payload that is not a mapping', ['kind: grant', 'payload: hello']],
      ['an unsupported payload version', ['kind: grant', 'payload:', '  version: 99', `  secret: ${valid}`]],
      ['a payload secret that is not a string', ['kind: grant', 'payload:', '  version: 1', '  secret: 42']],
    ]
    for (const [name, record] of records) {
      await expect(boot({ record }), name).rejects.toThrow(/stored session secret/u)
    }
  })

  it('fails loud when the credential provider stores no session secret', async () => {
    const ctx = new Context()
    const home = await mkdtemp(join(tmpdir(), 'qilin-accounts-nosecret-'))
    roots.push(home)
    ctx.provide('credentials', { modifyRecord: () => Promise.resolve(undefined) } as never)
    await expect(Accounts.apply(ctx, { qilinHome: home })).rejects.toThrow(/was not stored/u)
  })

  it('refuses a session whose account no longer exists', { timeout: 60_000 }, async () => {
    const server = await boot()
    const setup = await server('/api/auth/setup', post(undefined, { username: 'first', email: EMAIL, password: PASSWORD }))
    expect(setup.status).toBe(200)
    const secret = Buffer.from(await storedSecret(server.credentialsPath), 'base64url')
    const forged = new SessionCookies(secret, 24 * 60 * 60 * 1000).issue(
      new URL(server.base).host,
      { id: 'ghost', username: 'ghost', email: 'ghost@example.com', password: 'x', createdAt: 0, tokenVersion: 1 },
      Date.now(),
    )
    const cookie = forged.split(';', 1)[0] as string
    const entry = await server('/workspace', { redirect: 'manual', headers: { cookie } })
    expect(entry.status).toBe(302)
    expect(entry.headers.get('location')).toBe('/?next=%2Fworkspace')
  })
})
