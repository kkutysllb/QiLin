/**
 * `qilin tenants` roster operations: the account file every tenant runtime on
 * this Harness home shares, and the tenant directory each account owns.
 *
 * A tenant runtime admits exactly the account it serves, so a new account
 * cannot be created through a tenant's own Web surface (its registration is
 * closed). These commands are how a deployment adds, re-keys, and retires the
 * accounts its tenant runtimes serve.
 * @module @qilin-agent/cli/tenants-roster
 */

import { mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { resolveQilinHome } from '@qilin-agent/home-paths'
import { isTenantIdentity } from './tenant-runtime.ts'
import {
  AccountStore,
  accountsFilePath,
  isValidEmail,
  isValidUsername,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  normalizeUsername,
  type AccountRecord,
} from '@qilin-agent/accounts-local'

/** One roster row: one account and the tenant directory it owns. */
export interface RosterEntry {
  /** Opaque account identity, which also names the tenant directory. */
  readonly id: string
  /** Login name. */
  readonly username: string
  /** Stored address, or null. */
  readonly email: string | null
  /** Epoch milliseconds when the account was created. */
  readonly createdAt: number
  /** Absolute tenant directory under the shared home. */
  readonly tenantDirectory: string
  /** Whether that directory exists, which is whether the account ever ran. */
  readonly tenantDataPresent: boolean
}

/** What one roster mutation was asked to do. */
export interface AddAccountRequest {
  /** Login name, normalized before validation. */
  readonly username: string
  /** Address, normalized before validation; omitted stores none. */
  readonly email?: string | undefined
  /** Plaintext password, validated against the shared minimum length. */
  readonly password: string
}

/** Where a mutation reads the password it applies. */
export type PasswordSource =
  | { /** Prompt on the terminal without echoing the entry. */ readonly kind: 'prompt' }
  | { /** Read the first line of standard input, for unattended runs. */ readonly kind: 'stdin' }

/** One roster subcommand of `qilin tenants`. */
export type RosterRequest =
  | { readonly command: 'accounts' }
  | { readonly command: 'add'; readonly username: string; readonly email: string | undefined; readonly password: PasswordSource }
  | { readonly command: 'passwd'; readonly username: string; readonly password: PasswordSource }
  | { readonly command: 'remove'; readonly username: string; readonly purgeData: boolean }

/** Absolute tenant directory one account owns. */
function tenantDirectory(home: string, accountId: string): string {
  return join(home, 'tenants', accountId)
}

/** Whether a path exists. */
async function exists(path: string): Promise<boolean> {
  return await stat(path).then(() => true, () => false)
}

/** Open the shared home's roster. */
async function roster(home: string): Promise<AccountStore> {
  return await AccountStore.open(accountsFilePath(home))
}

/**
 * Every account of one shared home with the tenant directory it owns.
 * @param home - absolute shared Harness home.
 * @returns one entry per account, oldest first.
 */
export async function rosterEntries(home: string): Promise<RosterEntry[]> {
  const store = await roster(home)
  return await Promise.all(store.all().map(async account => ({
    id: account.id,
    username: account.username,
    email: account.email,
    createdAt: account.createdAt,
    tenantDirectory: tenantDirectory(home, account.id),
    tenantDataPresent: await exists(tenantDirectory(home, account.id)),
  })))
}

/**
 * Create one account in the shared roster.
 * @param home - absolute shared Harness home.
 * @param request - the login name, address, and password to store.
 * @returns the created account.
 * @throws Error when the name or address is refused or already taken.
 */
export async function addAccount(home: string, request: AddAccountRequest): Promise<AccountRecord> {
  const username = normalizeUsername(request.username)
  if (!isValidUsername(username)) {
    throw new Error(`qilin tenants: '${request.username}' is not an acceptable username: 3-32 characters of a-z, 0-9, '_', '.', or '-', starting with a letter or digit`)
  }
  if (request.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`qilin tenants: a password needs at least ${String(MIN_PASSWORD_LENGTH)} characters`)
  }
  const store = await roster(home)
  if (store.byUsername(username) !== undefined) throw new Error(`qilin tenants: the account ${username} already exists`)
  let email: string | null = null
  if (request.email !== undefined && request.email.trim() !== '') {
    email = normalizeEmail(request.email)
    if (!isValidEmail(email)) throw new Error(`qilin tenants: '${request.email}' is not an acceptable email address`)
    if (store.byEmail(email) !== undefined) throw new Error(`qilin tenants: the address ${email} already belongs to an account`)
  }
  return await store.add({ username, email }, request.password)
}

/**
 * Replace one account's password, retiring the sessions the previous one issued.
 * @param home - absolute shared Harness home.
 * @param username - the account's login name, normalized before lookup.
 * @param password - the replacement password.
 * @returns the stored successor.
 * @throws Error when no account has that name or the password is too short.
 */
export async function setAccountPassword(home: string, username: string, password: string): Promise<AccountRecord> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`qilin tenants: a password needs at least ${String(MIN_PASSWORD_LENGTH)} characters`)
  }
  const store = await roster(home)
  const account = store.byUsername(normalizeUsername(username))
  if (account === undefined) throw new Error(`qilin tenants: no account is named ${normalizeUsername(username)}`)
  return await store.setPassword(account.id, password)
}

/** What one removal did. */
export interface RemovalResult {
  /** The removed account. */
  readonly account: AccountRecord
  /** Tenant directory removed with `--purge-data`, when one existed. */
  readonly purgedDirectory: string | undefined
}

/**
 * Remove one account from the shared roster.
 *
 * A running tenant runtime keeps serving the account until it is reclaimed or
 * restarted; a runtime started afterwards fails loud, because the overlay
 * admits an account the roster no longer holds.
 * @param home - absolute shared Harness home.
 * @param username - the account's login name, normalized before lookup.
 * @param purgeData - also remove that account's tenant directory.
 * @returns the removed account and, when asked, the removed directory.
 * @throws Error when no account has that name, or when the tenant directory is not where it belongs.
 */
export async function removeAccount(home: string, username: string, purgeData: boolean): Promise<RemovalResult> {
  const store = await roster(home)
  const account = store.byUsername(normalizeUsername(username))
  if (account === undefined) throw new Error(`qilin tenants: no account is named ${normalizeUsername(username)}`)
  const directory = tenantDirectory(home, account.id)
  // Only a directory this home derives from one plain account identity may be
  // removed: the account file is a shared document, and an id that is a path
  // segment of its own would otherwise delete outside this deployment's tenants.
  const resolved = resolve(directory)
  if (purgeData && (!isTenantIdentity(account.id) || dirname(resolved) !== resolve(join(home, 'tenants')))) {
    throw new Error(`qilin tenants: refusing to remove ${resolved}, which is not this account's tenant directory`)
  }
  const removed = await store.remove(account.id)
  if (!purgeData || !await exists(directory)) return { account: removed, purgedDirectory: undefined }
  await rm(directory, { recursive: true, force: true })
  return { account: removed, purgedDirectory: directory }
}

/**
 * Read one password from standard input without echoing it.
 * @param prompt - the text shown on standard error before reading.
 * @returns the entered line, without its terminator.
 * @throws Error when standard input is not a terminal, so an unattended run cannot wait for input.
 */
async function promptPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error('qilin tenants: standard input is not a terminal; pipe the password in and pass --password-stdin')
  }
  // Echo is suppressed by writing readline's own output nowhere; the prompt goes
  // to standard error so the password never appears on the process's stdout.
  const silent = new Writable({ write(_chunk, _encoding, done) { done() } })
  const prompt_ = createInterface({ input: process.stdin, output: silent, terminal: true })
  try {
    process.stderr.write(prompt)
    const entered = await prompt_.question('')
    process.stderr.write('\n')
    return entered
  } finally {
    prompt_.close()
  }
}

/**
 * Read the first line of standard input.
 * @returns the line, without its terminator.
 */
async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer))
  return (Buffer.concat(chunks).toString('utf8').split('\n')[0] ?? '').replace(/\r$/u, '')
}

/**
 * Read the password one mutation applies.
 * @param source - whether to prompt or read standard input.
 * @param label - the account being changed, named in the confirmation prompt.
 * @returns the password.
 * @throws Error when an interactive entry is not confirmed, or when standard input is a terminal without a prompt.
 */
export async function readPassword(source: PasswordSource, label: string): Promise<string> {
  if (source.kind === 'stdin') return await readStandardInput()
  const entered = await promptPassword(`Password for ${label}: `)
  const confirmed = await promptPassword('Repeat password: ')
  if (entered !== confirmed) throw new Error('qilin tenants: the two passwords differ')
  return entered
}

/** One roster row as the table prints it. */
function formatRow(entry: RosterEntry): string {
  const created = new Date(entry.createdAt).toISOString().slice(0, 10)
  const data = entry.tenantDataPresent ? 'yes' : 'no'
  return `${entry.username.padEnd(20)} ${entry.id} ${created} ${data.padEnd(3)} ${entry.email ?? '-'}`
}

/**
 * Print the roster of one shared home.
 * @param home - absolute shared Harness home.
 * @param write - where each line goes.
 * @returns the printed entries.
 */
export async function printRoster(home: string, write: (line: string) => void): Promise<RosterEntry[]> {
  const entries = await rosterEntries(home)
  if (entries.length === 0) {
    write(`qilin tenants: ${home} has no accounts yet; create one with: qilin tenants add <username>`)
    return entries
  }
  write('USERNAME             ID                                   CREATED    DATA EMAIL')
  for (const entry of entries) write(formatRow(entry))
  write(`qilin tenants: ${String(entries.length)} account(s) in ${accountsFilePath(home)}`)
  return entries
}

/**
 * Create the tenant directory one account owns, so its first runtime starts in
 * a directory that exists even before a browser visits it.
 * @param home - absolute shared Harness home.
 * @param accountId - the account whose directory to create.
 * @returns the absolute directory.
 */
export async function ensureTenantDirectory(home: string, accountId: string): Promise<string> {
  const directory = tenantDirectory(home, accountId)
  await mkdir(directory, { recursive: true })
  return directory
}

/**
 * Run one roster subcommand over this Harness home and print what it did.
 *
 * Failures are reported as a message and a non-zero exit code rather than a
 * stack trace: every refusal here is something the operator can correct.
 * @param request - the roster subcommand and its arguments.
 * @returns the process exit code: 0 when the request was carried out, 1 when it was refused.
 */
export async function runTenantsRoster(request: RosterRequest): Promise<number> {
  const home = resolveQilinHome()
  try {
    switch (request.command) {
      case 'accounts': {
        await printRoster(home, (line) => { process.stdout.write(`${line}\n`) })
        return 0
      }
      case 'add': {
        const password = await readPassword(request.password, request.username)
        const account = await addAccount(home, { username: request.username, email: request.email, password })
        const directory = await ensureTenantDirectory(home, account.id)
        process.stdout.write(`qilin tenants: created ${account.username} (${account.id}); its tenant directory is ${directory}\n`)
        return 0
      }
      case 'passwd': {
        const password = await readPassword(request.password, request.username)
        const account = await setAccountPassword(home, request.username, password)
        process.stdout.write(`qilin tenants: replaced the password of ${account.username}; sessions it issued no longer verify\n`)
        return 0
      }
      case 'remove': {
        const removed = await removeAccount(home, request.username, request.purgeData)
        const kept = removed.purgedDirectory === undefined
          ? `its Sessions stay in ${tenantDirectory(home, removed.account.id)}`
          : `its tenant directory ${removed.purgedDirectory} is gone`
        process.stdout.write(`qilin tenants: retired ${removed.account.username} (${removed.account.id}); ${kept}\n`)
        return 0
      }
      default: {
        request satisfies never
        throw new Error(`qilin tenants: unhandled roster subcommand ${JSON.stringify(request)}`)
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}
