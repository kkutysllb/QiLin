/**
 * The `/api/auth` reads behind the account menu. The session cookie is HttpOnly
 * and same-origin, so neither request states a credentials option: the browser
 * attaches the cookie on its own.
 */

/** The signed-in account, as `/api/auth/status` reports it. */
export interface AccountUser {
  /** Account id. */
  readonly id: string
  /** Name the account signs in with; the menu's heading text. */
  readonly username: string
  /** Address the account carries, or null when it registered without one. */
  readonly email: string | null
  /** Account creation time in epoch milliseconds. */
  readonly createdAt: number
}

/** The fields of one `/api/auth/status` answer this menu reads. */
export interface AccountStatus {
  /** Whether the account gate is active for this deployment. */
  readonly enabled: boolean
  /** Whether the request carried a verified session. */
  readonly authenticated: boolean
  /** Account behind the session; null when the request carried none. */
  readonly user: AccountUser | null
}

/** What the menu knows about the signed-in account. */
export interface AccountFacts {
  /** Name shown as the menu heading; null when no account is known. */
  readonly accountName: string | null
  /** Whether the menu offers the sign-out row. */
  readonly signOutAvailable: boolean
}

/** Path of the account gate's status read. */
const AUTH_STATUS_PATH = '/api/auth/status'

/** Path that ends the browser's session. */
const AUTH_LOGOUT_PATH = '/api/auth/logout'

/** Page the browser lands on once its session is gone: the public entry surface. */
const LANDING_PATH = '/'

/** The answer for a deployment with no reachable account surface. */
const NO_ACCOUNT: AccountFacts = Object.freeze({ accountName: null, signOutAvailable: false })

/**
 * Read the account gate's status.
 *
 * An unreachable gate and a disabled gate are one answer to this menu: no
 * identity to name and no session to end, which is what a harness running
 * without accounts has.
 * @returns the account facts of the current browser session.
 */
export async function readAccountStatus(): Promise<AccountFacts> {
  try {
    const response = await fetch(AUTH_STATUS_PATH)
    if (!response.ok) return NO_ACCOUNT
    const status = await response.json() as AccountStatus
    if (!status.enabled) return NO_ACCOUNT
    // The gate is on, so a session exists to end even when this browser has
    // not signed in yet (the sign-in document itself reads the same answer).
    const user = status.authenticated ? status.user : null
    return { accountName: user?.username ?? null, signOutAvailable: true }
  } catch {
    // A failed read is the answer itself here: no session fact arrived, and
    // both rows it feeds are optional chrome.
    return NO_ACCOUNT
  }
}

/**
 * End this browser's session and land on the product's public page.
 *
 * The navigation happens only after the Host accepted the sign-out: a refused
 * or unreachable call leaves the page where it is, so the menu that offered
 * the row keeps working instead of stranding the user on a dead page.
 * @returns whether the session ended (false keeps the current page).
 */
export async function endSession(): Promise<boolean> {
  try {
    const response = await fetch(AUTH_LOGOUT_PATH, { method: 'POST' })
    if (!response.ok) return false
    location.assign(LANDING_PATH)
    return true
  } catch {
    // The POST is the only statement; an unreachable Host ends no session.
    return false
  }
}
