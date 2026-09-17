/**
 * The `/api/auth` endpoints: first-run initialization, sign-in, sign-up,
 * sign-out, credential change, and the status read the browser surface boots
 * from. Every answer is JSON and carries a stable error code, so the sign-in
 * document owns its own copy for each refusal. A success that establishes a
 * session also sets this deployment's session cookie, which is why every
 * endpoint that can mint one reads the request authority first.
 * @module @qilin/accounts-local/src/routes
 */

import type { ConnectionFetchRoute, ConnectionTrustRequest } from '@qilin/client-connection'
import type { AccountRecord, AccountStore } from './accounts.ts'
import { isRecord } from './json.ts'
import { hashPassword, verifyPassword } from './password.ts'
import { AUTH_API_PREFIX } from './paths.ts'
import { requestAuthority, type SessionCookies } from './session.ts'
import { isValidEmail, isValidUsername, MIN_PASSWORD_LENGTH, normalizeEmail, normalizeUsername } from './validation.ts'

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
}

/** One accepted input. */
interface Accepted<T> {
  readonly ok: true
  readonly value: T
}

/** One input this endpoint refuses, with the response that refusal owes. */
interface Refused {
  readonly ok: false
  readonly response: Response
}

/** Either an accepted input or the refusal answering it. */
type Outcome<T> = Accepted<T> | Refused

/** One submitted sign-up form, before any rule is applied. */
interface SubmittedSignUp {
  readonly username: string
  /** Normalized address, or null when the form left it blank. */
  readonly email: string | null
  readonly password: string
}

/** One submitted sign-in form, before any rule is applied. */
interface SubmittedLogin {
  /** Username or email address, normalized for lookup. */
  readonly identifier: string
  readonly password: string
}

/** The browser's view of one account; hashes and generations never cross the wire. */
interface AccountView {
  readonly id: string
  readonly username: string
  readonly email: string | null
  readonly createdAt: number
}

/** Response headers every endpoint shares: never cached, always JSON. */
const JSON_HEADERS: Readonly<Record<string, string>> = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
}

/**
 * One JSON answer in the endpoint envelope.
 * @param status - HTTP status.
 * @param body - the JSON body.
 * @param cookie - Set-Cookie value when the answer establishes or clears a session.
 * @returns the response.
 */
function failure(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message } })
}

/** One JSON answer with the shared headers. */
function json(status: number, body: unknown, cookie?: string): Response {
  const headers = new Headers(JSON_HEADERS)
  if (cookie !== undefined) headers.append('set-cookie', cookie)
  return new Response(JSON.stringify(body), { status, headers })
}

/** One refusal verdict carrying the answer it owes. */
function refuse(status: number, code: string, message: string): Refused {
  return { ok: false, response: failure(status, code, message) }
}

/** Project one stored account for the browser. */
function accountView(account: AccountRecord): AccountView {
  return { id: account.id, username: account.username, email: account.email, createdAt: account.createdAt }
}

/** Read one JSON object body. */
async function readBody(request: Request): Promise<Outcome<Record<string, unknown>>> {
  let decoded: unknown
  try {
    decoded = await request.json()
  } catch {
    // request.json() rejects only for a body that is not JSON, which is the
    // caller's own malformed input rather than a server failure.
    return refuse(400, 'invalid-body', 'The request body must be a JSON object.')
  }
  if (!isRecord(decoded)) return refuse(400, 'invalid-body', 'The request body must be a JSON object.')
  return { ok: true, value: decoded }
}

/** Read one submitted sign-up form. */
function readSignUp(body: Record<string, unknown>): Outcome<SubmittedSignUp> {
  const rawUsername = body.username
  const rawEmail = body.email
  const rawPassword = body.password
  if (typeof rawUsername !== 'string' || typeof rawPassword !== 'string'
    || rawUsername === '' || rawPassword === '') {
    return refuse(400, 'invalid-body', 'A username and a password are required.')
  }
  if (rawEmail !== undefined && typeof rawEmail !== 'string') {
    return refuse(400, 'invalid-body', 'The email address must be a string.')
  }
  const email = typeof rawEmail === 'string' && rawEmail.trim() !== '' ? normalizeEmail(rawEmail) : null
  return { ok: true, value: { username: normalizeUsername(rawUsername), email, password: rawPassword } }
}

/** Read one submitted sign-in form. */
function readLogin(body: Record<string, unknown>): Outcome<SubmittedLogin> {
  const rawIdentifier = body.identifier
  const rawPassword = body.password
  if (typeof rawIdentifier !== 'string' || typeof rawPassword !== 'string'
    || rawIdentifier === '' || rawPassword === '') {
    return refuse(400, 'invalid-body', 'A username or email address and a password are required.')
  }
  // One field carries either spelling; normalizing as a username lowercases it,
  // which is also how addresses are stored.
  return { ok: true, value: { identifier: normalizeUsername(rawIdentifier), password: rawPassword } }
}

/** Apply the sign-up rules to one submitted form. */
function acceptSignUp(submitted: SubmittedSignUp): Outcome<SubmittedSignUp> {
  if (!isValidUsername(submitted.username)) {
    return refuse(400, 'invalid-username', 'Usernames are 3 to 32 characters of letters, digits, dot, dash, or underscore, and start with a letter or digit.')
  }
  if (submitted.email !== null && !isValidEmail(submitted.email)) {
    return refuse(400, 'invalid-email', 'Enter an email address of the form name@example.com.')
  }
  if (submitted.password.length < MIN_PASSWORD_LENGTH) {
    return refuse(400, 'password-too-short', `Passwords must be at least ${String(MIN_PASSWORD_LENGTH)} characters long.`)
  }
  return { ok: true, value: submitted }
}

/** Read the authority every session cookie is bound to. */
function readAuthority(request: Request): Outcome<string> {
  const authority = requestAuthority(request.headers)
  if (authority === undefined) {
    return refuse(400, 'invalid-authority', 'The request must name the authority it was sent to.')
  }
  return { ok: true, value: authority }
}

/** One credential request whose authority and body both parsed. */
interface Admission {
  /** Request authority the session cookie will be bound to. */
  readonly authority: string
  /** The parsed JSON body. */
  readonly body: Record<string, unknown>
}

/**
 * Read one credential request's authority and JSON body, stopping at the first
 * refusal: every endpoint that mints a session needs both, in that order.
 * @param request - the incoming endpoint request.
 * @returns the admission, or the response refusing it.
 */
async function readAdmission(request: Request): Promise<Outcome<Admission>> {
  const authority = readAuthority(request)
  if (!authority.ok) return authority
  const body = await readBody(request)
  if (!body.ok) return body
  return { ok: true, value: { authority: authority.value, body: body.value } }
}

/**
 * Build the authentication endpoints.
 * @param deps - the account set, session cookies, and the request's account lookup.
 * @returns one route per endpoint, in documentation order.
 */
export function createAuthRoutes(deps: AuthRouteDeps): ConnectionFetchRoute[] {
  const status: ConnectionFetchRoute = {
    path: `${AUTH_API_PREFIX}status`,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => {
      const account = deps.currentAccount(request)
      return Promise.resolve(json(200, {
        enabled: deps.enabled,
        needsSetup: deps.store.isEmpty,
        registrationOpen: deps.registration === 'open',
        authenticated: account !== undefined,
        user: account === undefined ? null : accountView(account),
      }))
    },
  }

  const setup: ConnectionFetchRoute = {
    path: `${AUTH_API_PREFIX}setup`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      if (!deps.store.isEmpty) {
        return failure(409, 'already-initialized', 'An account already exists; sign in instead.')
      }
      const admission = await readAdmission(request)
      if (!admission.ok) return admission.response
      const submitted = readSignUp(admission.value.body)
      if (!submitted.ok) return submitted.response
      const accepted = acceptSignUp(submitted.value)
      if (!accepted.ok) return accepted.response
      const account = await deps.store.add(accepted.value, accepted.value.password)
      return json(200, { user: accountView(account) }, deps.sessions.issue(admission.value.authority, account, Date.now()))
    },
  }

  const register: ConnectionFetchRoute = {
    path: `${AUTH_API_PREFIX}register`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      if (deps.registration !== 'open') {
        return failure(403, 'registration-closed', 'This deployment does not accept new accounts.')
      }
      const admission = await readAdmission(request)
      if (!admission.ok) return admission.response
      const submitted = readSignUp(admission.value.body)
      if (!submitted.ok) return submitted.response
      const accepted = acceptSignUp(submitted.value)
      if (!accepted.ok) return accepted.response
      if (deps.store.byUsername(accepted.value.username) !== undefined) {
        return failure(409, 'username-taken', 'That username already has an account.')
      }
      if (accepted.value.email !== null && deps.store.byEmail(accepted.value.email) !== undefined) {
        return failure(409, 'email-taken', 'That email address already has an account.')
      }
      const account = await deps.store.add(accepted.value, accepted.value.password)
      return json(200, { user: accountView(account) }, deps.sessions.issue(admission.value.authority, account, Date.now()))
    },
  }

  const login: ConnectionFetchRoute = {
    path: `${AUTH_API_PREFIX}login`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const admission = await readAdmission(request)
      if (!admission.ok) return admission.response
      const submitted = readLogin(admission.value.body)
      if (!submitted.ok) return submitted.response
      const account = deps.store.byIdentifier(submitted.value.identifier)
      if (account === undefined || !await verifyPassword(submitted.value.password, account.password)) {
        return failure(401, 'invalid-credentials', 'That username, email address, and password do not match an account.')
      }
      return json(200, { user: accountView(account) }, deps.sessions.issue(admission.value.authority, account, Date.now()))
    },
  }

  const logout: ConnectionFetchRoute = {
    path: `${AUTH_API_PREFIX}logout`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => {
      const authority = requestAuthority(request.headers)
      const headers = new Headers({ 'cache-control': 'no-store' })
      if (authority !== undefined) headers.append('set-cookie', deps.sessions.clear(authority))
      return Promise.resolve(new Response(null, { status: 204, headers }))
    },
  }

  const changePassword: ConnectionFetchRoute = {
    path: `${AUTH_API_PREFIX}change-password`,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const authority = readAuthority(request)
      if (!authority.ok) return authority.response
      const account = deps.currentAccount(request)
      if (account === undefined) {
        return failure(401, 'unauthorized', 'Sign in before changing credentials.')
      }
      const body = await readBody(request)
      if (!body.ok) return body.response
      const current = body.value.currentPassword
      const next = body.value.newPassword
      if (typeof current !== 'string' || typeof next !== 'string' || current === '' || next === '') {
        return failure(400, 'invalid-body', 'Both the current password and the new password are required.')
      }
      if (!await verifyPassword(current, account.password)) {
        return failure(401, 'invalid-credentials', 'The current password is incorrect.')
      }
      if (next.length < MIN_PASSWORD_LENGTH) {
        return failure(400, 'password-too-short', `Passwords must be at least ${String(MIN_PASSWORD_LENGTH)} characters long.`)
      }
      // Both identity fields are optional: an omitted one keeps its stored value,
      // an empty address clears it, and a new name must be free.
      const submittedUsername = body.value.username
      const username = submittedUsername === undefined
        ? account.username
        : normalizeUsername(typeof submittedUsername === 'string' ? submittedUsername : '')
      if (!isValidUsername(username)) {
        return failure(400, 'invalid-username', 'Usernames are 3 to 32 characters of letters, digits, dot, dash, or underscore, and start with a letter or digit.')
      }
      if (username !== account.username && deps.store.byUsername(username) !== undefined) {
        return failure(409, 'username-taken', 'That username already has an account.')
      }
      const submittedEmail = body.value.email
      const email = submittedEmail === undefined
        ? account.email
        : typeof submittedEmail === 'string' && submittedEmail.trim() !== '' ? normalizeEmail(submittedEmail) : null
      if (email !== null && !isValidEmail(email)) {
        return failure(400, 'invalid-email', 'Enter an email address of the form name@example.com.')
      }
      if (email !== null && email !== account.email && deps.store.byEmail(email) !== undefined) {
        return failure(409, 'email-taken', 'That email address already has an account.')
      }
      const password = await hashPassword(next)
      // The credential generation moves with the password, so every session
      // issued under the previous one stops verifying.
      const changed = await deps.store.update(account.id, record => ({
        ...record,
        username,
        email,
        password,
        tokenVersion: record.tokenVersion + 1,
      }))
      return json(200, { user: accountView(changed) }, deps.sessions.issue(authority.value, changed, Date.now()))
    },
  }

  return [status, setup, register, login, logout, changePassword]
}
