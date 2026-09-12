/** Session cookies: what one signed token grants, and every way a foreign or stale one stops verifying. */

import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AccountRecord } from '../src/accounts.ts'
import { requestAuthority, SessionCookies } from '../src/session.ts'

const SECRET = Buffer.alloc(32, 7)
const MAX_AGE = 24 * 60 * 60 * 1000
const AUTHORITY = '127.0.0.1:3090'
const ACCOUNT: AccountRecord = {
  id: 'account-1',
  email: 'first@example.com',
  password: 'scrypt$32768$8$1$AAAA$AAAA',
  createdAt: 1_700_000_000_000,
  tokenVersion: 3,
}

const cookies = new SessionCookies(SECRET, MAX_AGE)

/** One session payload with every field spelled out, so a test can vary exactly one. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Date.now()
  return {
    version: 1,
    authority: AUTHORITY,
    subject: ACCOUNT.id,
    tokenVersion: ACCOUNT.tokenVersion,
    issuedAt: now,
    expiresAt: now + MAX_AGE,
    ...overrides,
  }
}

/** Sign one body with the deployment secret, bypassing the issuing path. */
function seal(body: string, secret: Buffer = SECRET): string {
  return `s1.${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`
}

/** The cookie name this authority's sessions use. */
function cookieNameFor(authority: string = AUTHORITY): string {
  return cookies.issue(authority, ACCOUNT, Date.now()).split('=', 1)[0] ?? ''
}

/** One Cookie header carrying the given value under an authority's cookie name. */
function cookieHeader(value: string, authority: string = AUTHORITY): Record<string, string> {
  return { host: authority, cookie: `${cookieNameFor(authority)}=${value}` }
}

/** Base64url of one JSON body. */
function body(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

/**
 * The same 32 signing bytes spelled with a non-zero padding bit: the decoder
 * returns the signed bytes, but the value is not their canonical encoding.
 */
function nonCanonicalSignature(signature: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const shift = alphabet.charAt(alphabet.indexOf(signature.slice(-1)) + 1)
  return signature.slice(0, -1) + shift
}

describe('session cookies', () => {
  it('issues one authority-bound, HttpOnly cookie per account', () => {
    const now = Date.now()
    const setCookie = cookies.issue(AUTHORITY, ACCOUNT, now)
    expect(setCookie).toContain('Max-Age=86400')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Strict')
    // The expiry mirrors the issuance timestamp the caller supplied.
    // The HTTP date carries whole seconds, so the expiry compares at that precision.
    const expires = new Date(setCookie.split('Expires=', 2)[1]!.split(';', 1)[0]!).getTime()
    expect(expires).toBe(Math.floor((now + MAX_AGE) / 1000) * 1000)
    // Two authorities never share a cookie name.
    expect(cookies.issue('127.0.0.1:3091', ACCOUNT, now).split('=', 1)[0]).not.toBe(setCookie.split('=', 1)[0])
    expect(cookies.clear(AUTHORITY)).toContain('Max-Age=0')
  })

  it('reads back the session it issued', () => {
    const setCookie = cookies.issue(AUTHORITY, ACCOUNT, Date.now())
    const value = setCookie.split(';', 1)[0]!.split('=', 2)[1]!
    const read = cookies.read({ headers: cookieHeader(value) })
    expect(read).toMatchObject({
      version: 1,
      authority: AUTHORITY,
      subject: ACCOUNT.id,
      tokenVersion: ACCOUNT.tokenVersion,
    })
    // The Fetch representation of the same headers verifies identically.
    expect(cookies.read({ headers: new Headers({ host: AUTHORITY, cookie: `${cookieNameFor()}=${value}` }) }))
      .toEqual(read)
  })

  it('ignores requests that carry no usable cookie', () => {
    expect(cookies.read({ headers: {} })).toBeUndefined()
    expect(cookies.read({ headers: { host: AUTHORITY } })).toBeUndefined()
    expect(cookies.read({ headers: { host: AUTHORITY, cookie: 'other=1' } })).toBeUndefined()
    expect(cookies.read({ headers: { cookie: `${cookieNameFor()}=x` } })).toBeUndefined()
    // Another authority's cookie, presented to this one.
    const other = cookies.issue('example.com', ACCOUNT, Date.now()).split(';', 1)[0]!.split('=', 2)[1]!
    expect(cookies.read({ headers: cookieHeader(other) })).toBeUndefined()
  })

  it('rejects a token whose bytes are not the ones it signed', () => {
    const valid = cookies.issue(AUTHORITY, ACCOUNT, Date.now()).split(';', 1)[0]!.split('=', 2)[1]!
    const [prefix, bodySegment, signature] = valid.split('.') as [string, string, string]
    const cases: readonly (readonly [string, string])[] = [
      ['too few segments', `${prefix}.${bodySegment}`],
      ['unknown signature version', `s2.${bodySegment}.${signature}`],
      ['a non-base64url body', `s1.%%%.${signature}`],
      ['a non-base64url signature', `s1.${bodySegment}.%%%`],
      ['a non-canonical signature', `s1.${bodySegment}.${signature}A`],
      ['another signing key', seal(bodySegment, Buffer.alloc(32, 9))],
      ['a non-canonical signature', `${prefix}.${bodySegment}.${nonCanonicalSignature(signature)}`],
      ['a body swapped under a valid signature', `s1.${body(payload({ subject: 'account-2' }))}.${signature}`],
      ['a body that is not JSON', seal(Buffer.from('not json', 'utf8').toString('base64url'))],
    ]
    for (const [name, value] of cases) {
      expect(cookies.read({ headers: cookieHeader(value) }), name).toBeUndefined()
    }
  })

  it('rejects a payload this deployment would never issue', () => {
    const days = [payload({ version: 2 }), payload({ authority: 7 }), payload({ subject: 7 }),
      payload({ tokenVersion: 1.5 }), payload({ issuedAt: 'now' }), payload({ expiresAt: 'later' }),
      payload({ issuedAt: Date.now() + 60_000 }), payload({ issuedAt: Date.now() - MAX_AGE - 1 }),
      payload({ expiresAt: Date.now() + MAX_AGE * 2 }), payload({ expiresAt: Date.now() - 1 }),
      []]
    for (const crafted of days) {
      expect(cookies.read({ headers: cookieHeader(seal(body(crafted))) }), JSON.stringify(crafted)).toBeUndefined()
    }
    // A payload whose lifetime is its own issuance time is equally impossible.
    const now = Date.now()
    expect(cookies.read({
      headers: cookieHeader(seal(body(payload({ issuedAt: now, expiresAt: now })))),
    })).toBeUndefined()
  })

  it('canonicalizes the request authority or refuses the request', () => {
    expect(requestAuthority({ host: 'LOCALHOST:3090' })).toBe('localhost:3090')
    expect(requestAuthority({ host: '[' })).toBeUndefined()
    expect(requestAuthority({})).toBeUndefined()
    expect(requestAuthority(new Headers({ host: '127.0.0.1:3090' }))).toBe('127.0.0.1:3090')
  })
})
