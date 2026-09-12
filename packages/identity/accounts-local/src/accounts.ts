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
  /** Normalized email address. */
  readonly email: string
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

/** Format version of the on-disk document. */
const FILE_VERSION = 1
const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700

/** Parse one account record, refusing anything this build did not write. */
function parseAccount(value: unknown, path: string): AccountRecord {
  if (!isRecord(value)) {
    throw new Error(`accounts-local: ${path} holds a malformed account record`)
  }
  const { id, email, password, createdAt, tokenVersion } = value
  if (typeof id !== 'string' || id === ''
    || typeof email !== 'string' || email === ''
    || typeof password !== 'string' || password === ''
    || typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt)
    || typeof tokenVersion !== 'number' || !Number.isSafeInteger(tokenVersion)) {
    throw new Error(`accounts-local: ${path} holds a malformed account record`)
  }
  return { id, email, password, createdAt, tokenVersion }
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
  if (!isRecord(decoded) || decoded.version !== FILE_VERSION || !Array.isArray(decoded.accounts)) {
    throw new Error(`accounts-local: ${path} is not an account file this build wrote`)
  }
  return decoded.accounts.map(entry => parseAccount(entry, path))
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
   * Account with one normalized email.
   * @param email - a normalized address.
   * @returns the account, or undefined when the address is unused.
   */
  byEmail(email: string): AccountRecord | undefined {
    return this.accounts.find(account => account.email === email)
  }

  /**
   * Create one account.
   * @param email - normalized email address.
   * @param password - plaintext password, already validated by the caller.
   * @returns the created account.
   */
  async add(email: string, password: string): Promise<AccountRecord> {
    const created: AccountRecord = {
      id: randomUUID(),
      email,
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
