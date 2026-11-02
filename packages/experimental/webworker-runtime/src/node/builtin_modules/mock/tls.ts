/**
 * `node:tls` for the worker: the preview deployment never opens a TLS socket —
 * the tunnel feeds synthesized plain-http requests into the same route table —
 * so the certificate callback is named, and TLS operations fail loud if a
 * request path ever reaches them.
 */
import { notImplementedFail } from '../../notImplementedFail.ts'

const MODULE = 'node:tls'

/**
 * A TLS socket. `http2-wrapper` builds its stream-socket wrapper at module
 * scope from Node's own internals — `new TLSSocket(passThrough)._handle._parentWrap`
 * — so the stub exposes that one private member with a constructible class.
 * A socket never connects, so nothing else about it is exercised on the boot path.
 */
export class TLSSocket {
  /** Node's private socket internals, as the wrapper reads them. */
  readonly _handle = { _parentWrap: { constructor: class JsStreamSocket {} } }
}

/** Certificate validation hook (unavailable). */
export const checkServerIdentity = notImplementedFail(MODULE, 'checkServerIdentity')

/** TLS connection (unavailable). */
export const connect = notImplementedFail(MODULE, 'connect')

/** TLS server (unavailable). */
export const createServer = notImplementedFail(MODULE, 'createServer')
