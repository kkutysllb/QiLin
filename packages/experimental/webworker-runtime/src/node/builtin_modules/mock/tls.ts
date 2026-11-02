/**
 * `node:tls` for the worker: the preview deployment never opens a TLS socket —
 * the tunnel feeds synthesized plain-http requests into the same route table —
 * so only the certificate callback `got` imports at module scope is named, and
 * it fails loud if a request path ever reaches it.
 */
import { notImplementedFail } from '../../notImplementedFail.ts'

const MODULE = 'node:tls'

/** Certificate validation hook (unavailable). */
export const checkServerIdentity = notImplementedFail(MODULE, 'checkServerIdentity')

/** TLS connection (unavailable). */
export const connect = notImplementedFail(MODULE, 'connect')

/** TLS server (unavailable). */
export const createServer = notImplementedFail(MODULE, 'createServer')
