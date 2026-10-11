/**
 * The durable account file of one harness home: account records, their scrypt
 * hashes, and the credential generation that retires issued sessions.
 *
 * One file is the deployment's only shared writable document, so every mutation
 * runs as a critical section: it holds {@link AccountStore}'s lock, re-reads the
 * file the lock protects, applies the change to what it finds, and replaces the
 * file atomically. Two runtimes changing credentials, or a command and a runtime,
 * therefore compose instead of writing back a snapshot that lost the other's
 * work. A failed write leaves the running server on the previous account set.
 * @module @qilin-agent/accounts-local/src/accounts
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { writeFileAtomic } from '@qilin-agent/atomic-write'
import { isRecord } from './json.ts'
import { hashPassword } from './password.ts'

/** One stored account. */
export interface AccountRecord {
  /** Opaque account identity carried by issued sessions. */
  readonly id: string
  /** Normalized username; the account's login name. */
  readonly username: string
  /** Normalized email address, or null when the account has none. */
  readonly email: string | null
  /** Encoded scrypt hash of the account password. */
  readonly password: string
  /** Epoch milliseconds when the account was created. */
  readonly createdAt: number
  /** Credential generation: a session carrying another value no longer verifies. */
  readonly tokenVersion: number
  /**
   * Present only on the deployment's one administrator: the account whose
   * runtime the hub hands the whole deployment's usage ledger to. Absent on
   * every other account, and a deployment refuses a second one.
   */
  readonly admin?: true
}

/** On-disk document shape. */
interface AccountsDocument {
  readonly version: number
  readonly accounts: readonly AccountRecord[]
}

/** The account identity a sign-up form supplies. */
export interface NewAccount {
  /** Normalized username. */
  readonly username: string
  /** Normalized address, or null when the form left it blank. */
  readonly email?: string | null
}

/** What the caller asking for a new account may also decide. */
export interface NewAccountOptions {
  /**
   * Create the deployment's administrator. A deployment holds one, so a second
   * request is refused where the write happens.
   */
  readonly admin?: boolean
}

/**
 * A change the account file's current contents refuse.
 *
 * The two uniqueness rules and first-run initialization are decided inside the
 * critical section, so a caller that raced another writer gets this refusal
 * instead of a silently overwritten account set.
 */
export class AccountConflictError extends Error {
  /**
   * @param kind - which rule refused the change.
   * @param message - the refusal, naming the account or address involved.
   */
  constructor(
    readonly kind: 'username' | 'email' | 'initialized' | 'admin',
    message: string,
  ) {
    super(message)
    this.name = 'AccountConflictError'
  }
}

/** Format version this build writes. */
const FILE_VERSION = 2
/**
 * Format version that stored an address and nothing else. Its records are read
 * as accounts whose username is that same address, so they keep signing in.
 */
const LEGACY_FILE_VERSION = 1
const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700

/** How long a mutation waits for a lock another writer holds before reporting it. */
const LOCK_TIMEOUT_MS = 5_000

/**
 * Age at which an unremoved lock is residue rather than a holder.
 *
 * It is longer than {@link LOCK_TIMEOUT_MS} on purpose: a waiter that gave up
 * first has to leave the lock to whoever holds it, and only a lock nobody is
 * waiting behind any more is one a writer died holding.
 */
const LOCK_STALE_MS = 30_000

/** How often a waiting mutation retries the lock. */
const LOCK_RETRY_MS = 25

/** One malformed-record refusal, naming the file. */
function malformed(path: string): Error {
  return new Error(`accounts-local: ${path} holds a malformed account record`)
}

/** Read the fields every format version stores. */
function readCommonFields(value: Record<string, unknown>, path: string): {
  id: string
  password: string
  createdAt: number
  tokenVersion: number
} {
  const { id, password, createdAt, tokenVersion } = value
  if (typeof id !== 'string' || id === ''
    || typeof password !== 'string' || password === ''
    || typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt)
    || typeof tokenVersion !== 'number' || !Number.isSafeInteger(tokenVersion)) {
    throw malformed(path)
  }
  return { id, password, createdAt, tokenVersion }
}

/** Parse one account record, refusing anything this build did not write. */
function parseAccount(value: unknown, path: string, version: number): AccountRecord {
  if (!isRecord(value)) throw malformed(path)
  const common = readCommonFields(value, path)
  if (version >= FILE_VERSION) {
    const { username, email } = value
    if (typeof username !== 'string' || username === '') throw malformed(path)
    if (email !== null && email !== undefined && (typeof email !== 'string' || email === '')) {
      throw malformed(path)
    }
    // The flag is additive: a file written before it existed has no key, and a
    // file that spells it as anything but true is not one this build wrote.
    const { admin } = value
    if (admin !== undefined && admin !== true) throw malformed(path)
    return {
      ...common,
      username,
      email: typeof email === 'string' ? email : null,
      ...(admin === true ? { admin: true as const } : {}),
    }
  }
  const { email } = value
  if (typeof email !== 'string' || email === '') throw malformed(path)
  return { ...common, username: email, email }
}

/** Parse one whole account document. */
function parseDocument(text: string, path: string): AccountRecord[] {
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch {
    // Only a body that is not JSON reaches this arm; the operator either
    // restores the file or removes it to start the account set over.
    throw new Error(`accounts-local: ${path} is not valid JSON`)
  }
  if (!isRecord(decoded) || !Array.isArray(decoded.accounts)) {
    throw new Error(`accounts-local: ${path} is not an account file this build wrote`)
  }
  const version = decoded.version
  if (version !== FILE_VERSION && version !== LEGACY_FILE_VERSION) {
    throw new Error(`accounts-local: ${path} is not an account file this build wrote`)
  }
  return decoded.accounts.map(entry => parseAccount(entry, path, version))
}

/**
 * Read one home's account file.
 * @param path - absolute account file path.
 * @returns the stored accounts, or none when the file does not exist yet.
 * @throws Error when an existing file is unreadable or malformed.
 */
async function readAccounts(path: string): Promise<readonly AccountRecord[]> {
  const text = await readFile(path, 'utf8').catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  })
  return text === undefined ? [] : parseDocument(text, path)
}

/**
 * One account record, ready to append.
 * @param identity - normalized username and optional normalized email.
 * @param password - plaintext password, already validated by the caller.
 * @param options - whether this account is the deployment's administrator.
 * @returns the record this build stores.
 */
async function createRecord(identity: NewAccount, password: string, options?: NewAccountOptions): Promise<AccountRecord> {
  return {
    id: randomUUID(),
    username: identity.username,
    email: identity.email ?? null,
    password: await hashPassword(password),
    createdAt: Date.now(),
    tokenVersion: 1,
    ...(options?.admin === true ? { admin: true as const } : {}),
  }
}

/** One change to the account set, with what the caller gets back. */
interface RosterChange<T> {
  /** The successor account set. */
  readonly accounts: readonly AccountRecord[]
  /** What the caller receives once the successor is durable. */
  readonly result: T
}

/** The account set of one harness home, with durable mutations. */
export class AccountStore {
  private accounts: readonly AccountRecord[]

  private constructor(
    private readonly path: string,
    accounts: readonly AccountRecord[],
  ) {
    this.accounts = accounts
  }

  /**
   * Read the account file of one harness home. An absent file is an empty
   * account set, which is the state the first sign-up initializes.
   * @param path - absolute account file path.
   * @returns the opened store.
   * @throws Error when an existing file is unreadable or malformed.
   */
  static async open(path: string): Promise<AccountStore> {
    return new AccountStore(path, await readAccounts(path))
  }

  /**
   * Every account, in creation order.
   * @returns the stored accounts, oldest first.
   */
  all(): readonly AccountRecord[] {
    return this.accounts
  }

  /** Whether no account exists yet, which is the first-run state. */
  get isEmpty(): boolean {
    return this.accounts.length === 0
  }

  /**
   * Account with one identity.
   * @param id - account identity from a session payload.
   * @returns the account, or undefined when it no longer exists.
   */
  byId(id: string): AccountRecord | undefined {
    return this.accounts.find(account => account.id === id)
  }

  /**
   * Account with one normalized username.
   * @param username - a normalized username.
   * @returns the account, or undefined when the name is unused.
   */
  byUsername(username: string): AccountRecord | undefined {
    return this.accounts.find(account => account.username === username)
  }

  /**
   * Account with one normalized email.
   * @param email - a normalized address.
   * @returns the account, or undefined when the address is unused.
   */
  byEmail(email: string): AccountRecord | undefined {
    return this.accounts.find(account => account.email === email)
  }

  /**
   * Account named by a login identifier, which may be either spelling.
   * A username wins over an address, so an account whose name happens to look
   * like another account's address still signs in under its own name.
   * @param identifier - a normalized username or email address.
   * @returns the account, or undefined when nothing matches.
   */
  byIdentifier(identifier: string): AccountRecord | undefined {
    return this.byUsername(identifier) ?? this.byEmail(identifier)
  }

  /**
   * Create one account.
   *
   * The name and the address are unique across the file the change lands in:
   * both rules are decided inside the critical section, because a caller's own
   * earlier read is not what the file holds by the time the write happens.
   * @param identity - normalized username and optional normalized email.
   * @param password - plaintext password, already validated by the caller.
   * @param options - whether this account is the deployment's administrator.
   * @returns the created account.
   * @throws {@link AccountConflictError} when the name, the address, or the
   * administrator seat is taken.
   */
  async add(identity: NewAccount, password: string, options?: NewAccountOptions): Promise<AccountRecord> {
    const created = await createRecord(identity, password, options)
    return await this.mutate((accounts) => {
      const taken = accounts.find(account => account.username === created.username)
      if (taken !== undefined) {
        throw new AccountConflictError('username', `accounts-local: the account ${created.username} already exists`)
      }
      if (created.email !== null && accounts.some(account => account.email === created.email)) {
        throw new AccountConflictError('email', `accounts-local: the address ${created.email} already belongs to an account`)
      }
      // The seat is decided against the set the write lands on, so two
      // simultaneous administrator requests produce one administrator.
      if (created.admin === true && accounts.some(account => account.admin === true)) {
        throw new AccountConflictError('admin', 'accounts-local: this deployment already has an administrator')
      }
      return { accounts: [...accounts, created], result: created }
    })
  }

  /**
   * Create the first account of an empty home.
   *
   * Whether the home is still empty is decided where the write happens, so two
   * simultaneous first-run submissions produce one account and one refusal
   * rather than two accounts.
   * @param identity - normalized username and optional normalized email.
   * @param password - plaintext password, already validated by the caller.
   * @param options - fields beyond the identity, such as the deployment's administrator seat.
   * @returns the created account.
   * @throws {@link AccountConflictError} when an account already exists.
   */
  async initialize(identity: NewAccount, password: string, options?: NewAccountOptions): Promise<AccountRecord> {
    const created = await createRecord(identity, password, options)
    return await this.mutate((accounts) => {
      if (accounts.length > 0) {
        throw new AccountConflictError('initialized', 'accounts-local: an account already exists')
      }
      return { accounts: [created], result: created }
    })
  }

  /**
   * Replace one account through a change function.
   * @param id - identity of the account to change.
   * @param change - pure mapping from the current record to its successor.
   * @returns the stored successor.
   * @throws Error when the account no longer exists.
   */
  async update(id: string, change: (account: AccountRecord) => AccountRecord): Promise<AccountRecord> {
    return await this.mutate((accounts) => {
      const current = accounts.find(account => account.id === id)
      if (current === undefined) throw new Error(`accounts-local: no account ${id} to update`)
      const changed = change(current)
      return {
        accounts: accounts.map(account => account.id === id ? changed : account),
        result: changed,
      }
    })
  }

  /**
   * Replace one account's password and retire every session issued under the
   * previous one, so a changed password ends the sessions it replaced.
   * @param id - identity of the account to change.
   * @param password - plaintext password, already validated by the caller.
   * @returns the stored successor.
   * @throws Error when the account no longer exists.
   */
  async setPassword(id: string, password: string): Promise<AccountRecord> {
    const encoded = await hashPassword(password)
    return await this.update(id, account => ({ ...account, password: encoded, tokenVersion: account.tokenVersion + 1 }))
  }

  /**
   * Remove one account from the roster. Sessions it issued stop naming an
   * account, and a deployment that admits it by name fails loud at load rather
   * than serving an account the file no longer holds.
   * @param id - identity of the account to remove.
   * @returns the removed account.
   * @throws Error when the account no longer exists.
   */
  async remove(id: string): Promise<AccountRecord> {
    return await this.mutate((accounts) => {
      const current = accounts.find(account => account.id === id)
      if (current === undefined) throw new Error(`accounts-local: no account ${id} to remove`)
      return { accounts: accounts.filter(account => account.id !== id), result: current }
    })
  }

  /**
   * Apply one change to the file's current contents, under this file's lock, and
   * publish it only once the successor bytes are in place.
   * @param change - the successor set, computed from what the file holds now.
   * @returns what the change returned.
   * @throws Error when another writer holds the lock past its deadline.
   */
  private async mutate<T>(change: (accounts: readonly AccountRecord[]) => RosterChange<T>): Promise<T> {
    const release = await this.acquire()
    try {
      const current = await readAccounts(this.path)
      const next = change(current)
      const document: AccountsDocument = { version: FILE_VERSION, accounts: next.accounts }
      await writeFileAtomic(this.path, `${JSON.stringify(document, null, 2)}\n`, {
        mode: FILE_MODE,
        dirMode: DIRECTORY_MODE,
      })
      this.accounts = next.accounts
      return next.result
    } finally {
      await release()
    }
  }

  /**
   * Hold this account file's lock for one mutation.
   *
   * The lock is a sibling file created exclusively, so every process that writes
   * this home's roster — the runtime that answers a browser and the command an
   * operator runs — takes the same critical section. A holder that dies without
   * removing it leaves a lock older than {@link LOCK_STALE_MS}, which the next
   * waiter treats as residue instead of waiting out its own deadline.
   * @returns the release to call when the mutation finishes.
   * @throws Error when the lock stays held past the deadline.
   */
  private async acquire(): Promise<() => Promise<void>> {
    const lockPath = `${this.path}.lock`
    await mkdir(dirname(this.path), { recursive: true, mode: DIRECTORY_MODE })
    const deadline = Date.now() + LOCK_TIMEOUT_MS
    for (;;) {
      try {
        const handle = await open(lockPath, 'wx', FILE_MODE)
        await handle.close()
        return async () => { await rm(lockPath, { force: true }) }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
      const held = await stat(lockPath).catch(() => undefined)
      if (held !== undefined && Date.now() - held.mtimeMs > LOCK_STALE_MS) {
        await rm(lockPath, { force: true })
        continue
      }
      if (Date.now() >= deadline) {
        throw new Error(`accounts-local: another writer holds ${lockPath}; retry the change`)
      }
      await new Promise((resolve) => { setTimeout(resolve, LOCK_RETRY_MS) })
    }
  }
}

/** Basename of the deployment's session-signing secret, beside its roster. */
const SESSION_SECRET_FILENAME = 'session-secret.json'

/** Bytes of that secret. */
const SECRET_BYTES = 32

/** Version tag of the secret document. */
const SECRET_VERSION = 1

/**
 * Absolute path of the deployment's session-signing secret.
 * @param qilinHome - the deployment's harness home.
 * @returns the secret document's path.
 */
export function sessionSecretPath(qilinHome: string): string {
  return join(qilinHome, 'auth', SESSION_SECRET_FILENAME)
}

/**
 * Read the deployment's session-signing secret, creating it on first run.
 *
 * The secret belongs to the deployment rather than to one runtime: every runtime
 * of a deployment answers the same browser origin, so a session one runtime
 * issues has to be a session the next one accepts. It therefore lives beside the
 * roster — the deployment's other shared document — and not in one runtime's
 * credentials, which each harness home holds separately.
 * @param qilinHome - the deployment's harness home.
 * @returns the HMAC key every session cookie of this deployment is signed with.
 * @throws Error when the document exists and is not a secret this package wrote.
 */
export async function loadSessionSecret(qilinHome: string): Promise<Buffer> {
  const path = sessionSecretPath(qilinHome)
  const stored = await readSessionSecret(path)
  if (stored !== undefined) return stored
  const fresh = randomBytes(SECRET_BYTES).toString('base64url')
  await mkdir(dirname(path), { recursive: true, mode: DIRECTORY_MODE })
  try {
    // Exclusive creation: two runtimes starting together settle on whichever one
    // wrote first, instead of each replacing the other's key.
    await writeFile(path, `${JSON.stringify({ version: SECRET_VERSION, secret: fresh })}\n`, { mode: FILE_MODE, flag: 'wx' })
    return Buffer.from(fresh, 'base64url')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const raced = await readSessionSecret(path)
    if (raced === undefined) throw new Error('accounts-local: stored session secret disappeared while it was created')
    return raced
  }
}

/**
 * Read one secret document, or undefined when it does not exist yet.
 * @param path - the secret document's path.
 * @returns the key it holds.
 * @throws Error when the document is not a secret this package wrote.
 */
async function readSessionSecret(path: string): Promise<Buffer | undefined> {
  let source: string
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    // No secret yet is the first run's ordinary state.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new Error('accounts-local: stored session secret is not a document this package wrote')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('accounts-local: stored session secret is not a document this package wrote')
  }
  const fields = parsed as Record<string, unknown>
  if (fields.version !== SECRET_VERSION || typeof fields.secret !== 'string') {
    throw new Error('accounts-local: stored session secret has an unsupported format')
  }
  const secret = Buffer.from(fields.secret, 'base64url')
  // The canonical re-encoding is the length check's companion: base64url decodes
  // several spellings of one byte string, and only the spelling this package
  // wrote may pass.
  if (secret.byteLength !== SECRET_BYTES || secret.toString('base64url') !== fields.secret) {
    throw new Error('accounts-local: stored session secret is not a canonical 32-byte base64url key')
  }
  return secret
}
