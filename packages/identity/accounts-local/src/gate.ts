/**
 * The account-session gate the browser transport consults: which `/api`
 * requests belong to the authentication surface itself, and what happens to an
 * index document request that carries no session. Serving a gated document
 * without a session is impossible here — the gate owns the redirect that sends
 * the browser to the document that can establish one.
 * @module @qilin/accounts-local/src/gate
 */

import type {
  ConnectionIndexResponse,
  ConnectionSessionAuthority,
  ConnectionTrustRequest,
} from '@qilin/client-connection'
import type { AccountRecord, AccountStore } from './accounts.ts'
import { AUTH_API_PREFIX, LOGIN_PATH, SETUP_PATH } from './paths.ts'

/** What the gate reads. */
export interface SessionGateDeps {
  /** The account set, read for the first-run state. */
  readonly store: AccountStore
  /** Account behind the request's session, or undefined. */
  readonly currentAccount: (request: ConnectionTrustRequest) => AccountRecord | undefined
}

/** Request pathname of one browser request. */
function pathnameOf(request: ConnectionTrustRequest): string {
  /* v8 ignore next -- `?? '/'` arm: node:http and Fetch callers always supply a target */
  return new URL(request.url ?? '/', 'http://qilin.invalid').pathname
}

/** Send one browser redirect, owning the response. */
function redirect(response: ConnectionIndexResponse, location: string): void {
  response.writeHead(302, {
    'cache-control': 'no-store',
    'location': location,
    'referrer-policy': 'no-referrer',
  })
  response.end()
}

/**
 * Build the session authority of one harness home.
 * @param deps - the account set and the request's account lookup.
 * @returns the authority the transport installs at its session seat.
 */
export function createSessionAuthority(deps: SessionGateDeps): ConnectionSessionAuthority {
  return {
    authorizeIndex(request, response) {
      if (deps.currentAccount(request) !== undefined) return true
      // No account at all means this deployment has never been set up: send the
      // browser to the first-run document instead of a sign-in it cannot pass.
      redirect(response, deps.store.isEmpty
        ? SETUP_PATH
        : `${LOGIN_PATH}?next=${encodeURIComponent(pathnameOf(request))}`)
      return false
    },
    isPublicApiRequest: request => pathnameOf(request).startsWith(AUTH_API_PREFIX),
    verify: request => deps.currentAccount(request) !== undefined,
  }
}
