/**
 * @qilin-agent/accounts-local — the local account surface of a Web deployment: one
 * account file under the harness home, scrypt password hashes, signed HttpOnly
 * session cookies, the `/api/auth` endpoints, and the account-session gate the
 * browser transport consults for its index documents and its shared `/api`
 * route. The file is the deployment's whole roster and the gate admits every
 * account in it, so one file alone is not a tenancy boundary. `admittedAccounts`
 * narrows one deployment to named accounts, and that is what makes the gate a
 * boundary between runtimes that share the file: a tenant runtime admits its own
 * accounts while plugins, model settings, and credentials stay shared. The
 * boundary is the runtime, never the account — every account one deployment
 * admits still reaches the same Sessions, credentials, and files.
 * @module @qilin-agent/accounts-local
 */

import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { Context } from '@qilin-agent/kylin'
import z from '@qilin-agent/schemastery'
import type { ConnectionTrustRequest } from '@qilin-agent/client-connection'
import { credentialKey } from '@qilin-agent/credentials'
import type { CredentialProvider, CredentialRecord } from '@qilin-agent/credentials'
import { resolveQilinHome } from '@qilin-agent/home-paths'
import { AccountStore, type AccountRecord } from './accounts.ts'
import { createSessionAuthority } from './gate.ts'
import { isRecord } from './json.ts'
import { createAuthRoutes } from './routes.ts'
import { SessionCookies } from './session.ts'

export { AUTH_API_PREFIX, LOGIN_PATH, SETUP_PATH } from './paths.ts'
export { AccountStore } from './accounts.ts'
export type { AccountRecord } from './accounts.ts'

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
  /**
   * Account identities this deployment admits: sign-in and every already-issued
   * session are refused for an account the list does not name.
   * @default every account in the harness home's account file
   */
  admittedAccounts?: string[] | undefined
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  registration: z.union([z.const('open'), z.const('closed')]).default('open'),
  sessionMaxAgeDays: z.natural().min(1).default(7),
  qilinHome: z.string(),
  // The union keeps the key absent when the deployment names no accounts: an
  // empty list is a deployment that admits nobody, which fails loud in apply().
  admittedAccounts: z.union([z.array(z.string()), z.const(undefined)]),
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
 * Read the account identities one deployment admits.
 *
 * The value crosses the configuration boundary, where a bare YAML key parses as
 * null and a scalar as itself; both are refused rather than read as a list.
 * @param value - the validated `admittedAccounts` config value.
 * @returns the named identities, or undefined when the deployment names none.
 * @throws Error when the value is present and is not a list of account ids.
 */
function accountIds(value: readonly string[] | undefined): readonly string[] | undefined {
  if (value === undefined) return undefined
  const candidate: unknown = value
  if (!Array.isArray(candidate) || !candidate.every((id): id is string => typeof id === 'string')) {
    throw new Error('accounts-local: admittedAccounts must list account ids')
  }
  return candidate
}

/**
 * Resolve the accounts one deployment admits from its own account file.
 * @param config - validated plugin config.
 * @param registration - effective registration policy.
 * @param store - the harness home's account set.
 * @param path - account file the store was opened from, named in failures.
 * @returns the admitted identities, or undefined when the deployment admits every account.
 * @throws Error when the list names no account, names one the file does not hold, or leaves registration open.
 */
function admitAccounts(
  config: Config,
  registration: 'open' | 'closed',
  store: AccountStore,
  path: string,
): ReadonlySet<string> | undefined {
  const named = accountIds(config.admittedAccounts)
  if (named === undefined) return undefined
  if (named.length === 0) throw new Error('accounts-local: admittedAccounts names no account')
  // An account the list does not name could never use this deployment, so
  // leaving registration open would hand a visitor an account with no way in.
  if (registration !== 'closed') {
    throw new Error('accounts-local: admittedAccounts requires registration: closed')
  }
  for (const id of named) {
    if (store.byId(id) === undefined) {
      throw new Error(`accounts-local: admittedAccounts names an account that ${path} does not hold: ${id}`)
    }
  }
  return new Set(named)
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
  const path = accountsFilePath(resolveQilinHome(config.qilinHome))
  const store = await AccountStore.open(path)
  const admitted = admitAccounts(config, registration, store, path)
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
    if (account === undefined || account.tokenVersion !== payload.tokenVersion) return undefined
    // An account this deployment does not admit stops naming a session here for
    // the same reason: the cookie is intact and says nothing this deployment serves.
    return admitted === undefined || admitted.has(account.id) ? account : undefined
  }
  for (const route of createAuthRoutes({ store, sessions, currentAccount, enabled, registration, admitted })) {
    ctx.connection.fetch.register(route)
  }
  if (enabled) {
    ctx.connection.session.install(createSessionAuthority({ currentAccount }))
  }
}
