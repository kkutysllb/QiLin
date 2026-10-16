/**
 * The `/api/auth` endpoints: first-run initialization, sign-in, sign-up,
 * sign-out, credential change, and the status read the browser surface boots
 * from. Every answer is JSON and carries a stable error code, so the sign-in
 * document owns its own copy for each refusal. A success that establishes a
 * session also sets this deployment's session cookie, which is why every
 * endpoint that can mint one reads the request authority first.
 * @module @qilin-agent/accounts-local/src/routes
 */
import type { ConnectionFetchRoute, ConnectionTrustRequest } from '@qilin-agent/client-connection'
import { type AccountRecord, type AccountStore } from './accounts.ts'
import { type SessionCookies } from './session.ts'
import type { LoginThrottle } from './throttle.ts'
/** What the authentication endpoints read and write. */
export interface AuthRouteDeps {
  /** The account set of this harness home. */
  readonly store: AccountStore
  /** Sessions this deployment mints and clears. */
  readonly sessions: SessionCookies
  /** Account behind the request's session, or undefined. */
  readonly currentAccount: (request: ConnectionTrustRequest) => AccountRecord | undefined
  /** Whether the session gate is active; a disabled gate still answers status. */
  readonly enabled: boolean
  /** Whether an anonymous visitor may create an additional account. */
  readonly registration: 'open' | 'closed'
  /** Account identities this deployment admits, or undefined when it admits every account. */
  readonly admitted: ReadonlySet<string> | undefined
  /** Failures this deployment counts before a repeated sign-in attempt has to wait. */
  readonly throttle: LoginThrottle
}
/**
 * Build the authentication endpoints.
 * @param deps - the account set, session cookies, and the request's account lookup.
 * @returns one route per endpoint, in documentation order.
 */
export declare function createAuthRoutes(deps: AuthRouteDeps): ConnectionFetchRoute[]
//# sourceMappingURL=routes.d.ts.map
