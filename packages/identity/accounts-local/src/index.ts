/**
 * @qilin/accounts-local — the local account surface of a Web deployment: one
 * account file under the harness home, scrypt password hashes, signed HttpOnly
 * session cookies, the `/api/auth` endpoints, and the account-session gate the
 * browser transport consults for its index documents and its shared `/api`
 * route. Accounts gate access to one harness home; they are not a tenancy
 * boundary, and a second account reaches the same Sessions, credentials, and
 * files as the first.
 * @module @qilin/accounts-local
 */

import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { Context } from '@qilin/kylin'
import z from '@deepseek-ai/schemastery'
import type { ConnectionTrustRequest } from '@qilin/client-connection'
import { credentialKey } from '@qilin/credentials'
import type { CredentialProvider, CredentialRecord } from '@qilin/credentials'
import { resolveQilinHome } from '@qilin/home-paths'
import { AccountStore, type AccountRecord } from './accounts.ts'
import { createSessionAuthority } from './gate.ts'
import { isRecord } from './json.ts'
import { createAuthRoutes } from './routes.ts'
import { SessionCookies } from './session.ts'

export { AUTH_API_PREFIX, LOGIN_PATH, SETUP_PATH } from './paths.ts'

/** Stable Cordis plugin name. */
export const name = 'accounts-local'

/** Services required before the account surface can mount. */
export const inject = ['connection', 'credentials']

/** Browser-session signing secret held by the credential provider. */
const SESSION_SECRET_KEY = credentialKey('accounts-local', 'session-secret')

/** Stored secret payload version. */
const SECRET_VERSION = 1
const SECRET_BYTES = 32
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000

/** Plugin config: the account surface's deployment choices. */
export interface Config {
  /**
   * Require an account session for every gated index document and every
   * `/api` request. A disabled gate leaves the endpoints mounted and returns
   * the launch-token authentication of the transport in its place.
   * @default true
   */
  enabled?: boolean
  /**
   * Whether an anonymous visitor may create an additional account. An open
   * registration lets anyone who can reach this server use the harness, so a
   * deployment binding beyond loopback closes it.
   * @default 'open'
   */
  registration?: 'open' | 'closed'
  /** Absolute browser-session lifetime in days. @default 7 */
  sessionMaxAgeDays?: number
  /** Explicit harness home; omitted follows `QILIN_HOME`, then `~/.qilin`. */
  qilinHome?: string
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  registration: z.union([z.const('open'), z.const('closed')]).default('open'),
  sessionMaxAgeDays: z.natural().min(1).default(7),
  qilinHome: z.string(),
})

/**
 * Account file of one harness home.
 * @param qilinHome - absolute harness home.
 * @returns the absolute account file path.
 */
export function accountsFilePath(qilinHome: string): string {
  return join(qilinHome, 'auth', 'accounts.json')
}

/**
 * Load this deployment's session signing secret, creating it on first run.
 * @param credentials - the harness credential provider.
 * @returns the HMAC key every session cookie is signed with.
 * @throws Error when the stored record is not a secret this package wrote.
 */
async function loadSessionSecret(credentials: CredentialProvider): Promise<Buffer> {
  const record: CredentialRecord | undefined = await credentials.modifyRecord(
    SESSION_SECRET_KEY,
    (current) => {
      if (current !== undefined) return Promise.resolve(undefined)
      return Promise.resolve({
        kind: 'grant',
        payload: { version: SECRET_VERSION, secret: randomBytes(SECRET_BYTES).toString('base64url') },
      })
    },
  )
  if (record === undefined) throw new Error('accounts-local: session secret was not stored')
  if (record.kind !== 'grant' || !isRecord(record.payload)
    || record.payload.version !== SECRET_VERSION || typeof record.payload.secret !== 'string') {
    throw new Error('accounts-local: stored session secret has an unsupported format')
  }
  const secret = Buffer.from(record.payload.secret, 'base64url')
  // The canonical re-encoding is the length check's companion: base64url decodes
  // several spellings of one byte string, and only the spelling this package
  // wrote may pass.
  if (secret.byteLength !== SECRET_BYTES || secret.toString('base64url') !== record.payload.secret) {
    throw new Error('accounts-local: stored session secret is not a canonical 32-byte base64url key')
  }
  return secret
}

/**
 * Mount the account surface: the authentication endpoints, and — when the gate
 * is enabled — the session authority the transport enforces.
 * @param ctx - plugin context carrying the connection and credential services.
 * @param config - validated {@link Config}.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const enabled = config.enabled ?? true
  const registration = config.registration ?? 'open'
  const sessionMaxAgeDays = config.sessionMaxAgeDays ?? 7
  const store = await AccountStore.open(accountsFilePath(resolveQilinHome(config.qilinHome)))
  const sessions = new SessionCookies(
    await loadSessionSecret(ctx.credentials),
    sessionMaxAgeDays * DAY_MILLISECONDS,
  )
  const currentAccount = (request: ConnectionTrustRequest): AccountRecord | undefined => {
    const payload = sessions.read(request)
    if (payload === undefined) return undefined
    const account = store.byId(payload.subject)
    // A credential change bumps the generation; a cookie minted before it stops
    // naming an account even though its signature still verifies.
    return account !== undefined && account.tokenVersion === payload.tokenVersion ? account : undefined
  }
  for (const route of createAuthRoutes({ store, sessions, currentAccount, enabled, registration })) {
    ctx.connection.fetch.register(route)
  }
  if (enabled) {
    ctx.connection.session.install(createSessionAuthority({ currentAccount }))
  }
}
