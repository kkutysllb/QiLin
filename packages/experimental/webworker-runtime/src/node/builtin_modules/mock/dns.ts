/**
 * `node:dns` stub. The preview deployment resolves nothing itself — the tunnel
 * carries every request and the worker never opens an outbound socket — so the
 * resolver surface `got`'s connection cache imports exists but fails loud when
 * a request path actually asks for it.
 */
import { notImplementedFail } from '../../notImplementedFail.ts'

const MODULE = 'node:dns'

/** getaddrinfo flag: map IPv4 addresses to IPv6 (Node parity). */
export const V4MAPPED = 8

/** getaddrinfo flag: return all addresses (Node parity). */
export const ALL = 16

/** getaddrinfo flag: honor the host's address configuration (Node parity). */
export const ADDRCONFIG = 32

/** DNS lookup (unavailable in the worker host). */
export const lookup = notImplementedFail(MODULE, 'lookup')

/** Resolver class (unavailable in the worker host). */
const Resolver = notImplementedFail(MODULE, 'Resolver')

/** Promise-shaped resolver face, as `node:dns/promises` carries it. */
export const promises = { Resolver }

/** CommonJS interop marker: the worker loader hands `default` to default imports. */
export const __esModule = true

/** CommonJS default export: the members `require()` hands a caller of this module. */
export default { V4MAPPED, ALL, ADDRCONFIG, lookup, promises }
