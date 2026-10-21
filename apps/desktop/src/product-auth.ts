/** Boot-secret account exchange for products that skip the welcome surface. */

import type { DesktopProductAuth } from './product.ts'

/** One account session the Host set in a `set-cookie` response header. */
export interface DesktopAccountSession {
  /** Cookie name; `accounts-local` hashes the request authority into it. */
  readonly name: string
  /** Signed session value. */
  readonly value: string
  /** Expiry in Unix seconds, when the Host set one. */
  readonly expiresAt?: number
}

/**
 * Parse the first cookie of a `set-cookie` header.
 * @param header - Raw header value, or null.
 * @returns The session, or undefined when the header is absent or malformed.
 */
export function parseAccountSessionCookie(header: string | null): DesktopAccountSession | undefined {
  if (header === null || header === '') return undefined
  const [pair] = header.split(';')
  if (pair === undefined) return undefined
  const equals = pair.indexOf('=')
  if (equals <= 0) return undefined
  const name = pair.slice(0, equals).trim()
  const value = pair.slice(equals + 1).trim()
  if (name === '' || value === '') return undefined
  const expires = /expires=([^;]+)/iu.exec(header)
  if (expires === null || expires[1] === undefined) return { name, value }
  const at = Date.parse(expires[1])
  return Number.isNaN(at) ? { name, value } : { name, value, expiresAt: Math.floor(at / 1000) }
}

/**
 * Exchange the boot secret for an account session.
 * @param args - Host origin, auth declaration, and the secret this launch generated.
 * @returns The session, or undefined when the Host has no account yet or refuses the secret.
 */
export async function mintProductAccountSession(args: {
  readonly origin: string
  readonly auth: DesktopProductAuth
  readonly secret: string
  readonly fetchImpl?: typeof fetch
}): Promise<DesktopAccountSession | undefined> {
  const fetchImpl = args.fetchImpl ?? fetch
  const response = await fetchImpl(new URL(args.auth.endpoint, args.origin), {
    method: 'POST',
    redirect: 'manual',
    headers: { [args.auth.header]: args.secret },
  })
  if (!response.ok) {
    console.warn(`desktop product: boot-secret sign-in refused with HTTP ${String(response.status)} at ${args.origin}`)
    await response.body?.cancel()
    return undefined
  }
  const session = parseAccountSessionCookie(response.headers.get('set-cookie'))
  if (session === undefined) console.warn(`desktop product: boot-secret sign-in returned no session cookie at ${args.origin}`)
  return session
}
