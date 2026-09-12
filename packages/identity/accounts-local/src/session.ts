/**
 * Account-session cookies: one signed token per browser, bound to the request
 * authority it was issued for and carrying the account identity plus the
 * credential generation it was minted under. The cookie is HttpOnly and
 * SameSite=Strict, so it travels only with same-site navigations and requests
 * and never becomes readable script state.
 * @module @qilin/accounts-local/src/session
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { ConnectionTrustRequest } from '@qilin/client-connection'
import type { AccountRecord } from './accounts.ts'
import { isRecord } from './json.ts'

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

const COOKIE_PREFIX = 'qilin-session-'
const PAYLOAD_VERSION = 1
const SIGNATURE_VERSION = 's1'
const SIGNATURE_SEGMENTS = 3
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u

/** Read one request header, whichever request representation supplied it. */
function header(headers: ConnectionTrustRequest['headers'], name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/** The two request facts one session cookie is read from. */
interface SessionLookup {
  /** Canonical authority the request reached this server by. */
  readonly authority: string
  /** Raw Cookie header, when the request carries one. */
  readonly cookie: string | undefined
}

/**
 * Read the authority and cookie header of one request together: a session is
 * only ever looked up for an authority this server can have been reached by.
 * @param headers - request headers from either representation.
 * @returns both facts, or undefined when the request names no usable authority.
 */
function lookupSession(headers: ConnectionTrustRequest['headers']): SessionLookup | undefined {
  const host = header(headers, 'host')
  if (host === undefined) return undefined
  try {
    return { authority: new URL(`http://${host}`).host, cookie: header(headers, 'cookie') }
  } catch {
    // A Host value the URL parser refuses is not an authority this server can
    // have been reached by; no cookie of ours names it either.
    return undefined
  }
}

/**
 * Canonical request authority of one request: the Host header as a URL host,
 * which is the audience every issued cookie is bound to.
 * @param headers - request headers.
 * @returns the canonical authority, or undefined when the request carries none.
 */
export function requestAuthority(headers: ConnectionTrustRequest['headers']): string | undefined {
  return lookupSession(headers)?.authority
}

/** Cookie name private to one authority, so two ports never share a session. */
function cookieName(authority: string): string {
  return COOKIE_PREFIX + createHash('sha256').update(authority).digest('base64url')
}

/**
 * Read one named cookie from a raw Cookie header. Session values are base64url
 * plus two dots, so the first `=` of a segment always separates name from value.
 */
function cookieValue(headerValue: string, name: string): string | undefined {
  const segment = headerValue.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))
  return segment?.slice(name.length + 1)
}

/** HMAC over one cookie body. */
function signature(secret: Buffer, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest()
}

/** Decode one signed payload, or undefined when it is not this deployment's intact token. */
function unseal(value: string, secret: Buffer): SessionPayload | undefined {
  const segments = value.split('.')
  if (segments.length !== SIGNATURE_SEGMENTS) return undefined
  const [version, body, encodedSignature] = segments
  if (version !== SIGNATURE_VERSION) return undefined
  /* v8 ignore next -- a three-segment split always yields three entries; the
  guard exists for the element type under noUncheckedIndexedAccess */
  if (body === undefined || encodedSignature === undefined) return undefined
  if (!BASE64URL_PATTERN.test(body) || !BASE64URL_PATTERN.test(encodedSignature)) return undefined
  const actualSignature = Buffer.from(encodedSignature, 'base64url')
  const expectedSignature = signature(secret, body)
  if (actualSignature.toString('base64url') !== encodedSignature) return undefined
  if (actualSignature.byteLength !== expectedSignature.byteLength
    || !timingSafeEqual(actualSignature, expectedSignature)) return undefined
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    // The signature matched, so the body is bytes this deployment signed; a
    // body that no longer parses is a truncated or hand-edited copy.
    return undefined
  }
  return readPayload(decoded)
}

/** Narrow one decoded cookie body to a session payload. */
function readPayload(decoded: unknown): SessionPayload | undefined {
  if (!isRecord(decoded)) return undefined
  const { version, authority, subject, tokenVersion, issuedAt, expiresAt } = decoded
  if (version !== PAYLOAD_VERSION) return undefined
  if (typeof authority !== 'string' || typeof subject !== 'string') return undefined
  if (typeof tokenVersion !== 'number' || !Number.isSafeInteger(tokenVersion)) return undefined
  if (typeof issuedAt !== 'number' || typeof expiresAt !== 'number') return undefined
  return { version: PAYLOAD_VERSION, authority, subject, tokenVersion, issuedAt, expiresAt }
}

/** Account sessions issued by one deployment. */
export class SessionCookies {
  /**
   * @param secret - HMAC key every session of this deployment is signed with.
   * @param maxAgeMilliseconds - absolute session lifetime in milliseconds.
   */
  constructor(
    private readonly secret: Buffer,
    private readonly maxAgeMilliseconds: number,
  ) {}

  /**
   * Mint the Set-Cookie value that grants one account a session.
   * @param authority - request authority the browser reached this server by.
   * @param account - the account the session speaks for.
   * @param now - issuance timestamp in epoch milliseconds.
   * @returns the complete Set-Cookie header value.
   */
  issue(authority: string, account: AccountRecord, now: number): string {
    const expiresAt = now + this.maxAgeMilliseconds
    const payload: SessionPayload = {
      version: PAYLOAD_VERSION,
      authority,
      subject: account.id,
      tokenVersion: account.tokenVersion,
      issuedAt: now,
      expiresAt,
    }
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    const value = `${SIGNATURE_VERSION}.${body}.${signature(this.secret, body).toString('base64url')}`
    const maxAgeSeconds = Math.floor(this.maxAgeMilliseconds / 1000)
    return `${cookieName(authority)}=${value}; Max-Age=${String(maxAgeSeconds)}; Path=/; `
      + `Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; SameSite=Strict`
  }

  /**
   * Mint the Set-Cookie value that clears one authority's session.
   * @param authority - request authority whose cookie the browser should drop.
   * @returns the complete Set-Cookie header value.
   */
  clear(authority: string): string {
    return `${cookieName(authority)}=; Max-Age=0; Path=/; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Strict`
  }

  /**
   * Read the session one request carries.
   * @param request - incoming request headers.
   * @returns the verified payload, or undefined when the request carries no valid session.
   */
  read(request: ConnectionTrustRequest): SessionPayload | undefined {
    const lookup = lookupSession(request.headers)
    if (lookup === undefined || lookup.cookie === undefined) return undefined
    const value = cookieValue(lookup.cookie, cookieName(lookup.authority))
    if (value === undefined) return undefined
    const payload = unseal(value, this.secret)
    if (payload === undefined || payload.authority !== lookup.authority) return undefined
    const now = Date.now()
    return payload.issuedAt <= now
      && payload.expiresAt > now
      && payload.expiresAt > payload.issuedAt
      && payload.expiresAt - payload.issuedAt <= this.maxAgeMilliseconds
      ? payload
      : undefined
  }
}
