/**
 * The durable account file of one harness home: account records, their scrypt
 * hashes, and the credential generation that retires issued sessions. Every
 * mutation replaces the file atomically and publishes in memory only after the
 * successor bytes are in place, so a failed write leaves the running server on
 * the previous account set.
 * @module @qilin/accounts-local/src/accounts
 */

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '@qilin/atomic-write'
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
}

/** On-disk document shape. */
interface AccountsDocument {
  readonly version: number
  readonly accounts: readonly AccountRecord[]
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
    return { ...common, username, email: typeof email === 'string' ? email : null }
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
    const text = await readFile(path, 'utf8').catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    })
    return new AccountStore(path, text === undefined ? [] : parseDocument(text, path))
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
   * @param identity - normalized username and optional normalized email.
   * @param password - plaintext password, already validated by the caller.
   * @returns the created account.
   */
  async add(identity: { username: string; email?: string | null }, password: string): Promise<AccountRecord> {
    const created: AccountRecord = {
      id: randomUUID(),
      username: identity.username,
      email: identity.email ?? null,
      password: await hashPassword(password),
      createdAt: Date.now(),
      tokenVersion: 1,
    }
    await this.commit([...this.accounts, created])
    return created
  }

  /**
   * Replace one account through a change function.
   * @param id - identity of the account to change.
   * @param change - pure mapping from the current record to its successor.
   * @returns the stored successor.
   * @throws Error when the account no longer exists.
   */
  async update(id: string, change: (account: AccountRecord) => AccountRecord): Promise<AccountRecord> {
    const current = this.byId(id)
    if (current === undefined) throw new Error(`accounts-local: no account ${id} to update`)
    const changed = change(current)
    await this.commit(this.accounts.map(account => account.id === id ? changed : account))
    return changed
  }

  /** Write the successor set, then publish it. */
  private async commit(accounts: readonly AccountRecord[]): Promise<void> {
    const document: AccountsDocument = { version: FILE_VERSION, accounts }
    await writeFileAtomic(this.path, `${JSON.stringify(document, null, 2)}\n`, {
      mode: FILE_MODE,
      dirMode: DIRECTORY_MODE,
    })
    this.accounts = accounts
  }
}
