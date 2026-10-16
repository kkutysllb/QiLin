/**
 * Account-session cookies: one signed token per browser, bound to the request
 * authority it was issued for and carrying the account identity plus the
 * credential generation it was minted under. The cookie is HttpOnly and
 * SameSite=Strict, so it travels only with same-site navigations and requests
 * and never becomes readable script state.
 * @module @qilin-agent/accounts-local/src/session
 */
import type { ConnectionTrustRequest } from '@qilin-agent/client-connection'
import type { AccountRecord } from './accounts.ts'
/** Signed session payload carried by one cookie. */
export interface SessionPayload {
  /** Format version of the payload. */
  readonly version: number
  /** Request authority the session was issued for. */
  readonly authority: string
  /** Account identity the session speaks for. */
  readonly subject: string
  /** Credential generation the session was minted under. */
  readonly tokenVersion: number
  /** Epoch milliseconds when the session was issued. */
  readonly issuedAt: number
  /** Epoch milliseconds after which the session stops verifying. */
  readonly expiresAt: number
}
/**
 * Header one hop in front of a runtime names the deployment's own authority in.
 *
 * A runtime reached through a deployment's single address is asked for a
 * *tenant* authority by its transport fences, while the sessions it mints belong
 * to the address the browser used. Naming them for the forwarded authority is
 * what keeps one cookie valid at every runtime of the deployment, so a browser
 * that signed in at the deployment's door reaches its own account's runtime
 * without signing in again.
 */
export declare const DEPLOYMENT_AUTHORITY_HEADER = 'x-qilin-deployment-authority'
/**
 * Canonical request authority of one request: the Host header as a URL host,
 * which is the audience every issued cookie is bound to.
 * @param headers - request headers.
 * @returns the canonical authority, or undefined when the request carries none.
 */
export declare function requestAuthority(headers: ConnectionTrustRequest['headers']): string | undefined
/** Account sessions issued by one deployment. */
export declare class SessionCookies {
  private readonly secret
  private readonly maxAgeMilliseconds
  private readonly secure
  /**
     * @param secret - HMAC key every session of this deployment is signed with.
     * @param maxAgeMilliseconds - absolute session lifetime in milliseconds.
     * @param secure - whether the browser reaches this deployment over TLS, so
     * every cookie it sets must carry `Secure`. A deployment whose public address
     * terminates TLS sets this even though the runtime behind it speaks HTTP.
     */
  constructor(secret: Buffer, maxAgeMilliseconds: number, secure?: boolean)
  /** Attributes every cookie this deployment sets carries. */
  private attributes
  /**
     * Mint the Set-Cookie value that grants one account a session.
     * @param authority - request authority the browser reached this server by.
     * @param account - the account the session speaks for.
     * @param now - issuance timestamp in epoch milliseconds.
     * @returns the complete Set-Cookie header value.
     */
  issue(authority: string, account: AccountRecord, now: number): string
  /**
     * Mint the Set-Cookie value that clears one authority's session.
     * @param authority - request authority whose cookie the browser should drop.
     * @returns the complete Set-Cookie header value.
     */
  clear(authority: string): string
  /**
     * Read the session one request carries.
     * @param request - incoming request headers.
     * @returns the verified payload, or undefined when the request carries no valid session.
     */
  read(request: ConnectionTrustRequest): SessionPayload | undefined
}
//# sourceMappingURL=session.d.ts.map
