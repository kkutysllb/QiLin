/**
 * The request paths of the authentication surface. They are product-surface
 * constants rather than deployment tunables: the sign-in documents, the
 * endpoint prefix, and the redirect targets a browser is sent to are what
 * makes this surface one thing.
 * @module @qilin/accounts-local/src/paths
 */

/** Absolute path prefix of the authentication endpoints below `/api`. */
export const AUTH_API_PREFIX = '/api/auth/'

/**
 * Request path serving the pre-session landing page: where an unauthenticated
 * visitor is sent, and where a session that ended leaves the browser.
 */
export const LANDING_PATH = '/'

/** Request path serving the sign-in document. */
export const LOGIN_PATH = '/login'

/** Request path serving the first-run document. */
export const SETUP_PATH = '/setup'
