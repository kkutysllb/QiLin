/** Local Web document and authenticated HTTP forwarding for the application window. */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon',
}
const BOOT = '<script>globalThis.__QILIN_BOOT_READY__ = Promise.withResolvers()</script>'

/**
 * Read an application-owned static asset; the index waits for asynchronous Host injections.
 * @param request - Local application request.
 * @param root - Packaged Web dist directory.
 * @returns Static response, or a missing/invalid path response.
 */
export async function serveWebDocument(request: Request, root: string): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  const url = new URL(request.url)
  let pathname: string
  try { pathname = decodeURIComponent(url.pathname) } catch { return new Response(null, { status: 400 }) }
  const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
  const directory = resolve(root)
  if (!target.startsWith(directory + sep)) return new Response(null, { status: 403 })
  let body: Buffer
  try { body = await readFile(target) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 })
    throw error
  }
  const content = pathname === '/' || pathname === '/index.html'
    ? body.toString().replace('<head>', '<head>' + BOOT) : new Uint8Array(body)
  return new Response(request.method === 'HEAD' ? null : content, {
    headers: { 'content-type': MIME[extname(target)] ?? 'application/octet-stream' },
  })
}

/**
 * Exchange the Host launch URL for an authority-bound browser cookie.
 * @param url - Authenticated URL reported by the owned Host process.
 * @returns Cookie header for requests forwarded to that Host.
 */
export async function authenticateWebHost(url: string): Promise<string> {
  const response = await fetch(url, { redirect: 'manual' })
  const cookie = response.headers.get('set-cookie')
  await response.body?.cancel()
  if (response.status !== 303 || cookie === null) throw new Error('Desktop Host authentication failed')
  const end = cookie.indexOf(';')
  return end < 0 ? cookie : cookie.slice(0, end)
}

/**
 * Response headers not relayed to the renderer. `set-cookie` would hand the
 * Host's cookies to the page's cookie jar, which the shell owns instead: the
 * launch exchange keeps the device cookie, and the account-session cookie is
 * captured through `forwardWebRequest` before withholding. The rest describe
 * the Node `fetch` connection (its encoding, length, and hop-by-hop
 * transport), which Chromium never sees.
 */
const WITHHELD_RESPONSE_HEADERS = [
  'set-cookie',
  'content-encoding', 'content-length',
  'transfer-encoding', 'connection', 'keep-alive', 'te', 'trailer', 'upgrade', 'proxy-authenticate', 'proxy-authorization',
]

/** Name prefix of the account-session cookie the Host's `/api/auth` endpoints issue (`accounts-local`). */
export const ACCOUNT_SESSION_COOKIE_PREFIX = 'qilin-session-'

/** One account-session cookie a Host response set or cleared. */
export interface WebSessionCookie {
  /** Cookie name; hashes the request authority, so it changes when the Host port does. */
  readonly name: string
  /** Cookie value; empty on a cleared cookie. */
  readonly value: string
  /** Epoch seconds after which the cookie stops being sent; absent when the Host set no lifetime. */
  readonly expiresAt?: number
}

/** Read one cookie attribute value, or undefined when the attribute is absent. */
function cookieAttribute(attributes: readonly string[], name: string): string | undefined {
  for (const attribute of attributes) {
    const at = attribute.indexOf('=')
    if (at !== -1 && attribute.slice(0, at).trim().toLowerCase() === name) return attribute.slice(at + 1).trim()
  }
  return undefined
}

/**
 * Parse one Set-Cookie value into an account-session cookie, or undefined for
 * every other cookie: the shell stores only the session the Host's
 * account-session gate verifies, never arbitrary Host cookies. Max-Age
 * overrides Expires (RFC 6265).
 * @param setCookie - one Set-Cookie header value.
 * @returns the cookie facts; a cleared cookie carries an empty value or a past `expiresAt`.
 */
export function accountSessionCookie(setCookie: string): WebSessionCookie | undefined {
  const [pair, ...attributes] = setCookie.split(';')
  /* v8 ignore next -- a semicolon split always yields at least one entry; the
  guard exists for the element type under noUncheckedIndexedAccess */
  if (pair === undefined) return undefined
  const at = pair.indexOf('=')
  if (at === -1) return undefined
  const name = pair.slice(0, at).trim()
  if (!name.startsWith(ACCOUNT_SESSION_COOKIE_PREFIX)) return undefined
  const rawMaxAge = cookieAttribute(attributes, 'max-age')
  const maxAge = rawMaxAge === undefined || rawMaxAge === '' ? Number.NaN : Number(rawMaxAge)
  const expires = Date.parse(cookieAttribute(attributes, 'expires') ?? '')
  return {
    name,
    value: pair.slice(at + 1).trim(),
    ...(Number.isFinite(maxAge)
      ? { expiresAt: Math.floor(Date.now() / 1000) + maxAge }
      : Number.isNaN(expires) ? {} : { expiresAt: Math.floor(expires / 1000) }),
  }
}

/**
 * Cookie header of a forwarded request: the stored account session first, then
 * the device cookie the launch exchange issued.
 * @param accountSession - account session captured from an earlier response, when one is stored.
 * @param deviceCookie - `name=value` pair from `authenticateWebHost`.
 * @returns the Cookie header value to forward.
 */
export function webCookieHeader(accountSession: WebSessionCookie | undefined, deviceCookie: string): string {
  return accountSession === undefined
    ? deviceCookie
    : `${accountSession.name}=${accountSession.value}; ${deviceCookie}`
}

/** Header naming the authority account sessions belong to; it wins over the Host header (`accounts-local`). */
export const DEPLOYMENT_AUTHORITY_HEADER = 'x-qilin-deployment-authority'

/**
 * The desktop's stable session authority. The Host listens on a port chosen per launch while the
 * account-session cookie is named for its authority, so the shell names this portless loopback
 * authority on every request it forwards or sends: sessions survive Host restarts instead of
 * dying with the port.
 */
export const DESKTOP_AUTHORITY = '127.0.0.1'

/**
 * Cookie name the Host's account-session gate looks up for one authority (`accounts-local` hashes it).
 * @param authority - authority the session belongs to.
 * @returns the exact cookie name to store, restore, and clear.
 */
export function accountSessionCookieName(authority: string = DESKTOP_AUTHORITY): string {
  return ACCOUNT_SESSION_COOKIE_PREFIX + createHash('sha256').update(authority).digest('base64url')
}

/** Host routes whose responses carry immutable cache headers keyed by a per-process revision. */
const PLUGIN_BUNDLE_PATH = /^\/plugins\//u

/**
 * Forward local application requests to its authenticated Host, preserving streaming and cancellation.
 * Plugin bundle responses lose their `cache-control` for `no-store`: the Host marks them immutable
 * under a revision that changes every launch, so Chromium's disk cache would only accumulate bundles
 * no later launch can reuse.
 * @param request - Request from the application origin.
 * @param host - Owned Host URL.
 * @param cookie - Cookie header forwarded to the Host.
 * @param onAccountSession - sink for the account-session cookie each response sets, before withholding.
 * @returns Host response without connection-level headers.
 */
export async function forwardWebRequest(request: Request, host: string, cookie: string,
  onAccountSession?: (session: WebSessionCookie) => void): Promise<Response> {
  const source = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== 'qilin-app://app') return new Response(null, { status: 403 })
  const target = new URL(host)
  target.pathname = source.pathname
  target.search = source.search
  const headers = new Headers(request.headers)
  for (const name of ['host', 'origin', 'cookie', 'sec-fetch-site', DEPLOYMENT_AUTHORITY_HEADER]) headers.delete(name)
  headers.set('cookie', cookie)
  headers.set(DEPLOYMENT_AUTHORITY_HEADER, DESKTOP_AUTHORITY)
  const init = { method: request.method, headers, body: request.body, signal: request.signal, duplex: 'half', redirect: 'manual' as const }
  const response = await fetch(target, init)
  for (const setCookie of response.headers.getSetCookie()) {
    const captured = accountSessionCookie(setCookie)
    if (captured !== undefined) onAccountSession?.(captured)
  }
  const outgoing = new Headers(response.headers)
  for (const name of WITHHELD_RESPONSE_HEADERS) outgoing.delete(name)
  if (PLUGIN_BUNDLE_PATH.test(source.pathname)) outgoing.set('cache-control', 'no-store')
  return new Response(response.body, { status: response.status, headers: outgoing })
}
