/**
 * The account facts a pre-session document reads from the Host. The landing
 * page uses them to choose the document its entry calls to action opens, and
 * the sign-in document uses them to pick the form it renders and to bounce an
 * already-authenticated visitor on.
 */

/** Server path reporting the account state a pre-session visitor may act on. */
const STATUS_ENDPOINT = '/api/auth/status'

/** The account facts `GET /api/auth/status` decides for a pre-session page. */
export interface AccountStatus {
  /** Whether this browser already carries a verified session. */
  readonly authenticated: boolean
  /** Whether the server offers self-registration. */
  readonly registrationOpen: boolean
  /** Whether the deployment has no account yet, so the first-run form applies. */
  readonly needsSetup: boolean
}

/**
 * Ask the server which account decisions apply to this visitor.
 * @returns the three facts, or undefined when the request cannot answer them.
 */
export async function readAccountStatus(): Promise<AccountStatus | undefined> {
  let payload: unknown
  try {
    const response = await fetch(STATUS_ENDPOINT, { headers: { accept: 'application/json' } })
    if (!response.ok) return undefined
    payload = await response.json()
  } catch {
    // A visitor the status endpoint cannot reach still gets a form; the caller
    // decides what an unknown state means for it.
    return undefined
  }
  if (typeof payload !== 'object' || payload === null) return undefined
  const facts: Record<string, unknown> = payload as Record<string, unknown>
  const authenticated = facts['authenticated']
  const registrationOpen = facts['registrationOpen']
  const needsSetup = facts['needsSetup']
  if (typeof authenticated !== 'boolean' || typeof registrationOpen !== 'boolean'
    || typeof needsSetup !== 'boolean') return undefined
  return { authenticated, registrationOpen, needsSetup }
}
