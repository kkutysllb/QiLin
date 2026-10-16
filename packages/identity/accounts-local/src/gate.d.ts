/**
 * The account-session gate the browser transport consults: which `/api`
 * requests belong to the authentication surface itself, and what happens to an
 * index document request that carries no session. Serving a gated document
 * without a session is impossible here — the gate owns the redirect that sends
 * the browser to the product's public page, which owns the way in.
 * @module @qilin-agent/accounts-local/src/gate
 */
import type { ConnectionSessionAuthority, ConnectionTrustRequest } from '@qilin-agent/client-connection'
import type { AccountRecord } from './accounts.ts'
/** What the gate reads. */
export interface SessionGateDeps {
  /** Account behind the request's session, or undefined. */
  readonly currentAccount: (request: ConnectionTrustRequest) => AccountRecord | undefined
}
/**
 * Build the session authority of one harness home.
 * @param deps - the account set and the request's account lookup.
 * @returns the authority the transport installs at its session seat.
 */
export declare function createSessionAuthority(deps: SessionGateDeps): ConnectionSessionAuthority
//# sourceMappingURL=gate.d.ts.map
