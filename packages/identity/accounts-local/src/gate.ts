/**
 * The account-session gate the browser transport consults: which `/api`
 * requests belong to the authentication surface itself, and what happens to an
 * index document request that carries no session. Serving a gated document
 * without a session is impossible here — the gate owns the redirect that sends
 * the browser to the product's public page, which owns the way in.
 * @module @qilin/accounts-local/src/gate
 */

import type {
  ConnectionIndexResponse,
  ConnectionSessionAuthority,
  ConnectionTrustRequest,
} from '@qilin/client-connection'
import type { AccountRecord } from './accounts.ts'
import { AUTH_API_PREFIX, LANDING_PATH } from './paths.ts'

/** What the gate reads. */
export interface SessionGateDeps {
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
      // An unauthenticated visitor lands on the product's public page, never on
      // a credential form: the landing page asks the status endpoint which
      // document applies (sign in or first run) and hands back this path, so a
      // visitor who came for a page still reaches it after signing in.
      redirect(response, `${LANDING_PATH}?next=${encodeURIComponent(pathnameOf(request))}`)
      return false
    },
    isPublicApiRequest: request => pathnameOf(request).startsWith(AUTH_API_PREFIX),
    verify: request => deps.currentAccount(request) !== undefined,
  }
}
