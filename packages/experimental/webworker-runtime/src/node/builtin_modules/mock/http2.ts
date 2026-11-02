/**
 * `node:http2` stub. The preview deployment speaks HTTP/1.1 through the
 * tunnel's fake server and never opens an HTTP/2 session; the package exists so
 * `got`'s HTTP/2 connection cache can be imported, and every connection symbol
 * fails loud if a request path ever negotiates it.
 */
import { notImplementedFail } from '../../notImplementedFail.ts'

const MODULE = 'node:http2'

/** HTTP/2 client session (unavailable). */
export const connect = notImplementedFail(MODULE, 'connect')

/** Cleartext HTTP/2 server (unavailable). */
export const createServer = notImplementedFail(MODULE, 'createServer')

/** Secure HTTP/2 server (unavailable). */
export const createSecureServer = notImplementedFail(MODULE, 'createSecureServer')

/**
 * Protocol constants. The connection cache destructures them at module scope;
 * the values are only read on a real HTTP/2 handshake, which never happens here.
 */
export const constants = {}

/** CommonJS interop marker: the worker loader hands `default` to default imports. */
export const __esModule = true

/** CommonJS default export: the members `require()` hands a caller of this module. */
export default { connect, createServer, createSecureServer, constants }
