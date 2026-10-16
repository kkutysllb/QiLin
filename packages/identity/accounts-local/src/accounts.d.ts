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
export declare class AccountConflictError extends Error {
  /** Which stored account conflicts with the submission. */
  readonly kind: 'username' | 'email' | 'initialized' | 'admin'
  /**
     * @param kind - which rule refused the change.
     * @param message - the refusal, naming the account or address involved.
     */
  constructor(kind: 'username' | 'email' | 'initialized' | 'admin', message: string)
}
/** The account set of one harness home, with durable mutations. */
export declare class AccountStore {
  private readonly path
  private accounts
  private constructor()
  /**
     * Read the account file of one harness home. An absent file is an empty
     * account set, which is the state the first sign-up initializes.
     * @param path - absolute account file path.
     * @returns the opened store.
     * @throws Error when an existing file is unreadable or malformed.
     */
  static open(path: string): Promise<AccountStore>
  /**
     * Every account, in creation order.
     * @returns the stored accounts, oldest first.
     */
  all(): readonly AccountRecord[]
  /** Whether no account exists yet, which is the first-run state. */
  get isEmpty(): boolean
  /**
     * Account with one identity.
     * @param id - account identity from a session payload.
     * @returns the account, or undefined when it no longer exists.
     */
  byId(id: string): AccountRecord | undefined
  /**
     * Account with one normalized username.
     * @param username - a normalized username.
     * @returns the account, or undefined when the name is unused.
     */
  byUsername(username: string): AccountRecord | undefined
  /**
     * Account with one normalized email.
     * @param email - a normalized address.
     * @returns the account, or undefined when the address is unused.
     */
  byEmail(email: string): AccountRecord | undefined
  /**
     * Account named by a login identifier, which may be either spelling.
     * A username wins over an address, so an account whose name happens to look
     * like another account's address still signs in under its own name.
     * @param identifier - a normalized username or email address.
     * @returns the account, or undefined when nothing matches.
     */
  byIdentifier(identifier: string): AccountRecord | undefined
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
  add(identity: NewAccount, password: string, options?: NewAccountOptions): Promise<AccountRecord>
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
  initialize(identity: NewAccount, password: string, options?: NewAccountOptions): Promise<AccountRecord>
  /**
     * Replace one account through a change function.
     * @param id - identity of the account to change.
     * @param change - pure mapping from the current record to its successor.
     * @returns the stored successor.
     * @throws Error when the account no longer exists.
     */
  update(id: string, change: (account: AccountRecord) => AccountRecord): Promise<AccountRecord>
  /**
     * Replace one account's password and retire every session issued under the
     * previous one, so a changed password ends the sessions it replaced.
     * @param id - identity of the account to change.
     * @param password - plaintext password, already validated by the caller.
     * @returns the stored successor.
     * @throws Error when the account no longer exists.
     */
  setPassword(id: string, password: string): Promise<AccountRecord>
  /**
     * Remove one account from the roster. Sessions it issued stop naming an
     * account, and a deployment that admits it by name fails loud at load rather
     * than serving an account the file no longer holds.
     * @param id - identity of the account to remove.
     * @returns the removed account.
     * @throws Error when the account no longer exists.
     */
  remove(id: string): Promise<AccountRecord>
  /**
     * Apply one change to the file's current contents, under this file's lock, and
     * publish it only once the successor bytes are in place.
     * @param change - the successor set, computed from what the file holds now.
     * @returns what the change returned.
     * @throws Error when another writer holds the lock past its deadline.
     */
  private mutate
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
  private acquire
}
/**
 * Absolute path of the deployment's session-signing secret.
 * @param qilinHome - the deployment's harness home.
 * @returns the secret document's path.
 */
export declare function sessionSecretPath(qilinHome: string): string
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
export declare function loadSessionSecret(qilinHome: string): Promise<Buffer>
//# sourceMappingURL=accounts.d.ts.map
