/**
 * @qilin-agent/accounts-local — the local account surface of a Web deployment: one
 * account file under the harness home, scrypt password hashes, signed HttpOnly
 * session cookies, the `/api/auth` endpoints, and the account-session gate the
 * browser transport consults for its index documents and its shared `/api`
 * route. The file is the deployment's whole roster and the gate admits every
 * account in it, so one file alone is not a tenancy boundary. `admittedAccounts`
 * narrows one deployment to named accounts, and that is what makes the gate a
 * boundary between runtimes that share the file: a tenant runtime admits its own
 * accounts while plugins, model settings, and credentials stay shared. The
 * boundary is the runtime, never the account — every account one deployment
 * admits still reaches the same Sessions, credentials, and files.
 * @module @qilin-agent/accounts-local
 */
import type { Context } from '@qilin-agent/kylin'
import z from '@qilin-agent/schemastery'
export { AUTH_API_PREFIX, LOGIN_PATH, SETUP_PATH } from './paths.ts'
export { DEPLOYMENT_AUTHORITY_HEADER } from './session.ts'
export { AccountStore } from './accounts.ts'
export type { AccountRecord } from './accounts.ts'
export { isValidEmail, isValidUsername, MIN_PASSWORD_LENGTH, normalizeEmail, normalizeUsername } from './validation.ts'
export { verifyPassword } from './password.ts'
/** Stable Cordis plugin name. */
export declare const name = 'accounts-local'
/** Services required before the account surface can mount. */
export declare const inject: string[]
/** Plugin config: the account surface's deployment choices. */
export interface Config {
  /**
     * Require an account session for every gated index document and every
     * `/api` request. A disabled gate leaves the endpoints mounted and returns
     * the launch-token authentication of the transport in its place.
     * @default true
     */
  enabled?: boolean
  /**
     * Whether an anonymous visitor may create an additional account. An open
     * registration lets anyone who can reach this server use the harness, so a
     * deployment binding beyond loopback closes it.
     * @default 'open'
     */
  registration?: 'open' | 'closed'
  /** Absolute browser-session lifetime in days. @default 7 */
  sessionMaxAgeDays?: number
  /**
     * Failed sign-ins one authority may accumulate for the same identifier before
     * further attempts are refused with `429` and `Retry-After`. One runtime
     * serves one account, so this is that account's limit.
     * @default 10
     */
  loginMaxAttempts?: number
  /**
     * Window in seconds that a failed sign-in counts toward that refusal, and the
     * wait a refused caller is told to take. @default 900
     */
  loginAttemptWindowSeconds?: number
  /**
     * Mark the session cookie `Secure`, so a browser returns it only over TLS.
     * A deployment whose public address terminates TLS sets this, even though the
     * runtime behind that address speaks HTTP.
     * @default false
     */
  sessionCookieSecure?: boolean
  /** Explicit harness home; omitted follows `QILIN_HOME`, then `~/.qilin`. */
  qilinHome?: string
  /**
     * Account identities this deployment admits: sign-in and every already-issued
     * session are refused for an account the list does not name.
     * @default every account in the harness home's account file
     */
  admittedAccounts?: string[] | undefined
}
export declare const Config: z<Config>
/**
 * Account file of one harness home.
 * @param qilinHome - absolute harness home.
 * @returns the absolute account file path.
 */
export declare function accountsFilePath(qilinHome: string): string
/**
 * Mount the account surface: the authentication endpoints, and — when the gate
 * is enabled — the session authority the transport enforces.
 * @param ctx - plugin context carrying the connection and credential services.
 * @param config - validated {@link Config}.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>
//# sourceMappingURL=index.d.ts.map
