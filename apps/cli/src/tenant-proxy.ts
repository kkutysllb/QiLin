/**
 * The hub's transport hop into one tenant runtime: an HTTP request forwarded
 * with that runtime's own authority, and an upgraded socket piped the same way.
 *
 * The hop changes transport facts only. It rewrites `Host` to the tenant's
 * authority — the tenant's session cookie is named after the authority it was
 * issued for, so one browser can hold one cookie per tenant on one origin —
 * and rewrites `Origin` to that same authority after checking the browser's
 * own Origin names the hub, which keeps the tenant's same-origin fence as
 * strong as it is without a proxy. Everything else, including `Range`,
 * `Set-Cookie`, `Location`, and partial-content answers, crosses unchanged.
 *
 * The hop decides no access: the tenant runtime's own account gate answers
 * every request, so a forged routing cookie reaches a runtime that does not
 * recognize the caller.
 * @module @qilin-agent/cli/tenant-proxy
 */

import { DEPLOYMENT_AUTHORITY_HEADER } from '@qilin-agent/accounts-local'
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect } from 'node:net'
import { Readable, type Duplex } from 'node:stream'

/**
 * Headers that name one connection rather than one message: forwarded, they
 * would promise the browser a connection the hub does not have.
 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/** One request the hub forwards. */
export interface ProxyRequestOptions {
  /** Origin the runtime serves, such as `http://127.0.0.1:41234`. */
  readonly origin: string
  /** Request method, verbatim. */
  readonly method: string
  /** Path and query to request upstream, exactly the path the browser asked for. */
  readonly path: string
  /** Browser headers, verbatim. */
  readonly headers: IncomingHttpHeaders
  /** Browser authority that reached the hub, checked against the Origin fence. */
  readonly hubAuthority: string
  /** Incoming body, when the request carries one. */
  readonly body?: Readable | undefined
}

/** One upstream answer, still streaming. */
export interface ProxyAnswer {
  /** Status code the runtime answered. */
  readonly status: number
  /** Answer headers, hop-by-hop entries removed. */
  readonly headers: IncomingHttpHeaders
  /** Answer body. */
  readonly stream: Readable
}

/**
 * Whether a browser-labeled request may be forwarded at all.
 *
 * Over plain HTTP a read carries neither Origin nor Fetch-Metadata, so an
 * absent Origin is accepted and the tenant's own Host fence still binds the
 * request. A present Origin must name the hub exactly, and an explicit
 * cross-site marker is refused: the hub is the outermost hop, so this is the
 * only place those markers can be read before the tenant's authority replaces
 * them.
 * @param headers - browser headers, verbatim.
 * @param hubAuthority - authority the browser used to reach the hub.
 * @returns true when the request may be forwarded.
 */
export function hubAcceptsOrigin(headers: IncomingHttpHeaders, hubAuthority: string): boolean {
  if (headers['sec-fetch-site'] === 'cross-site') return false
  const origin = headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hubAuthority
  } catch {
    // A syntactically invalid Origin — including the opaque 'null' — names no
    // authority the hub serves.
    return false
  }
}

/**
 * Headers to forward upstream: the browser's own, minus connection-scoped
 * entries, with the authority-bearing ones rewritten to the tenant.
 * @param headers - browser headers, verbatim.
 * @param tenantAuthority - the runtime's own `host:port`.
 * @param deploymentAuthority - authority the browser used to reach the hub, and
 * therefore the one the runtime names its sessions for; empty when the request
 * reached a runtime directly, which then keeps its own authority as the name.
 * Required rather than optional because every hop of this deployment knows it,
 * and an upgrade that forgot it authenticates against a cookie no browser holds.
 * @returns the forwarded header set.
 */
export function forwardedHeaders(
  headers: IncomingHttpHeaders,
  tenantAuthority: string,
  deploymentAuthority: string,
): IncomingHttpHeaders {
  const forwarded: IncomingHttpHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()
    // The deployment authority is never taken from the browser: this hop is the
    // only one that can name it.
    if (HOP_BY_HOP.has(lower) || lower === 'host' || lower === 'origin' || lower === DEPLOYMENT_AUTHORITY_HEADER) continue
    forwarded[name] = value
  }
  forwarded.host = tenantAuthority
  // Rewritten only when it was present, so a non-browser client keeps its
  // unlabelled request unlabelled.
  if (headers.origin !== undefined) forwarded.origin = `http://${tenantAuthority}`
  // The transport fences above check the tenant's authority; the sessions the
  // runtime mints are named for the deployment's, which is the address the
  // browser actually used. A direct request (no hub hop, no deployment
  // authority) keeps the tenant authority as its own.
  if (deploymentAuthority !== '') {
    forwarded[DEPLOYMENT_AUTHORITY_HEADER] = deploymentAuthority
  }
  return forwarded
}

/**
 * Send one request to a tenant runtime and hand back its streaming answer.
 *
 * The hub's own origin fence runs here, in the operation that would forward the
 * request, so no caller can forward a browser request whose Origin names
 * another site.
 * @param options - the runtime, the path, headers, and body to forward.
 * @returns the runtime's status, headers, and body, or the refusal.
 * @throws Error when the runtime is unreachable or refuses the connection.
 */
export async function proxyRequest(options: ProxyRequestOptions): Promise<ProxyAnswer> {
  const origin = new URL(options.origin)
  if (!hubAcceptsOrigin(options.headers, options.hubAuthority)) {
    return {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      stream: Readable.from('qilin tenants: that origin is not this hub\n'),
    }
  }
  const answered = Promise.withResolvers<ProxyAnswer>()
  const upstream = httpRequest({
    protocol: origin.protocol,
    hostname: origin.hostname,
    port: origin.port,
    method: options.method,
    path: options.path,
    headers: forwardedHeaders(options.headers, origin.host, options.hubAuthority),
  })
  upstream.on('response', (response: IncomingMessage) => {
    answered.resolve({
      status: response.statusCode ?? 502,
      headers: response.headers,
      stream: response,
    })
  })
  upstream.on('error', (error: Error) => { answered.reject(error) })
  options.body?.pipe(upstream)
  if (options.body === undefined) upstream.end()
  return await answered.promise
}

/**
 * Write one upstream answer to the browser, streaming the body.
 * @param answer - the runtime's status, headers, and body.
 * @param response - the browser's response.
 */
export function relayAnswer(answer: ProxyAnswer, response: ServerResponse): void {
  const headers: IncomingHttpHeaders = {}
  for (const [name, value] of Object.entries(answer.headers)) {
    if (HOP_BY_HOP.has(name.toLowerCase())) continue
    headers[name] = value
  }
  response.writeHead(answer.status, headers)
  answer.stream.pipe(response)
}

/**
 * Pipe one upgraded browser socket to the same path on a tenant runtime, with
 * the tenant's authority in place of the hub's.
 *
 * The upgrade is piped, never terminated: the hub holds no copy of the frames,
 * so the tenant's own mux and its trust fence stay in charge of the stream.
 * @param request - the browser's upgrade request.
 * @param socket - the browser's socket.
 * @param head - bytes already read from the browser.
 * @param target - origin of the runtime the socket belongs to.
 * @param headers - already-forwarded headers, with the tenant's authority set.
 */
export function relayUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  target: string,
  headers: IncomingHttpHeaders,
): void {
  const origin = new URL(target)
  const upstream = connect({ host: origin.hostname, port: Number(origin.port) })
  const lines = [`${request.method ?? 'GET'} ${request.url ?? '/'} HTTP/1.1`]
  // The forwarded set drops connection-scoped entries, and a runtime reads a
  // request without them as an ordinary one, so the upgrade is restated here.
  lines.push('connection: Upgrade')
  const upgrade = request.headers.upgrade
  lines.push(`upgrade: ${typeof upgrade === 'string' && upgrade !== '' ? upgrade : 'websocket'}`)
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${entry}`)
  }
  upstream.on('connect', () => {
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head.length > 0) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  const closeBoth = (): void => { upstream.destroy(); socket.destroy() }
  upstream.on('error', closeBoth)
  socket.on('error', closeBoth)
  socket.on('close', () => { upstream.destroy() })
}
