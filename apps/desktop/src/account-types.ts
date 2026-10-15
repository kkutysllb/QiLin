/**
 * Account primitives the desktop assembly consumes.
 *
 * Upstream declares these in its account package, which this repository does not
 * carry: the account stack stays out by policy and the desktop's onboarding and
 * policy surfaces are inert here. The declarations stay exact so the assembly
 * keeps compiling against the same contracts.
 *
 * @module account-types
 */

/** Client build facts upstream sends with every platform request. */
export interface AccountClientMetadata {
  readonly version: string
  readonly locale: string
  readonly timezoneOffsetSeconds: number
}

/** One sign-in attempt as the desktop observes it. */
export interface AccountAttempt {
  readonly id: SignInAttemptId
  readonly phase: 'initializing' | 'waiting-browser' | 'exchanging' | 'committing' | 'succeeded' | 'cancelled' | 'expired' | 'failed'
  readonly authorizeUrl?: string
  readonly expiresAt?: number
  readonly errorCode?: 'no-response' | 'network' | 'protocol' | 'expired' | 'storage'
}

/** Account links the desktop may open in a browser. */
export interface AccountLinks {
  readonly usageUrl: string
  readonly topUpUrl: string
}

/** One account as the desktop observes it. */
export interface AccountView {
  readonly status: string
  readonly links: AccountLinks
  readonly attempt: AccountAttempt | null
}

/** Platform credentials bound to one account provider lifetime. */
export interface PlatformSession {
  readonly userId: string
  readonly token: string
  readonly cookies: readonly string[]
  readonly origin: string
  readonly requestHeaders: Readonly<Record<string, string>>
  readonly embeddedPageDist: string | null
}

/** Identifier for one sign-in attempt. */
export type SignInAttemptId = string & { readonly __signInAttempt: unique symbol }

/**
 * Build the client headers a platform request carries.
 * @param metadata - Client build facts.
 * @returns Headers describing this client build.
 */
export function platformClientHeaders(platform: string, client: AccountClientMetadata): Record<string, string> {
  return {
    'x-client-version': client.version,
    'accept-language': client.locale,
    'x-timezone-offset': String(client.timezoneOffsetSeconds),
    'x-platform': platform,
  }
}

/**
 * Merge one request's cookie header with cookies a platform session injects.
 * @param current - Cookie header the request already carries.
 * @param injected - Cookie header the platform session adds.
 * @returns The merged cookie header, without empty parts.
 */
export function mergePlatformCookies(current: string, injected: string): string {
  return [current, injected].filter(part => part !== '').join('; ')
}

/** Path the remote stream mux answers on. */
export const REMOTE_STREAM_MUX_PATH = '/api/remote-stream'

/** One frame of the remote stream. */
export interface RemoteStreamFrame {
  /** Stream this frame belongs to. */
  readonly streamId: string
  /** Frame kind. */
  readonly type: string
  /** Frame payload. */
  readonly value?: unknown
}

/**
 * Parse one server message from the remote stream.
 * @param raw - Raw message text.
 * @returns The parsed message.
 */
export function parseRemoteStreamServerMessage(raw: string): RemoteStreamFrame {
  return JSON.parse(raw) as RemoteStreamFrame
}
