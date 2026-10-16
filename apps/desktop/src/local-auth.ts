/** Local account operations the Desktop welcome window drives. */

/** Local account routes served by the Host; wire paths of the accounts-local service. */
const LOGIN_ROUTE = '/api/auth/login'
const SETUP_ROUTE = '/api/auth/setup'

/** Outcome of one local account request. */
export interface LocalAuthResult {
  readonly ok: boolean
  /** Server-provided reason code when the request was refused. */
  readonly reason?: string
}

/**
 * Submit one local account request to the Host that owns this Desktop.
 * @param origin - Host origin serving the local account routes.
 * @param kind - login or registration.
 * @param body - submitted fields; never logged.
 * @param send - Electron session fetch, retaining the Host cookie.
 * @returns whether the Host accepted the submission, with its refusal reason when it did not.
 */
export async function submitLocalAccount(origin: string, kind: 'login' | 'setup',
  body: Readonly<Record<string, string>>, send: (input: string, init?: RequestInit) => Promise<Response>): Promise<LocalAuthResult> {
  // The login route accepts a username or an email address, named as one identifier.
  const payload = kind === 'login' ? { identifier: body.username ?? '', password: body.password ?? '' } : body
  const response = await send(new URL(kind === 'login' ? LOGIN_ROUTE : SETUP_ROUTE, origin).href, {
    method: 'POST', credentials: 'include', redirect: 'error',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (response.ok) return { ok: true }
  let reason: string | undefined
  try {
    const decoded: unknown = await response.json()
    if (typeof decoded === 'object' && decoded !== null && 'reason' in decoded && typeof decoded.reason === 'string') reason = decoded.reason
  } catch {
    // A refusal body that is not JSON carries no reason; the status alone speaks.
    reason = undefined
  }
  return reason === undefined ? { ok: false } : { ok: false, reason }
}
