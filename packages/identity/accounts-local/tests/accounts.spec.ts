/** The durable account file: parsing, mutation, and the state a failed write leaves behind. */

import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountConflictError, AccountStore, type AccountRecord } from '../src/accounts.ts'
import { verifyPassword } from '../src/password.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true, maxRetries: 3 })
  root = undefined
})

/** Create one fresh temporary harness home. */
async function home(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'qilin-accounts-'))
  return root
}

/** One well-formed stored account of the current format, before any field is corrupted. */
function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'account-1',
    username: 'first',
    email: 'first@example.com',
    password: 'scrypt$32768$8$1$AAAA$AAAA',
    createdAt: 1_700_000_000_000,
    tokenVersion: 1,
    ...overrides,
  }
}

/** One well-formed record of the previous format, which stored only an address. */
function legacyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'legacy-1',
    email: 'first@example.com',
    password: 'scrypt$32768$8$1$AAAA$AAAA',
    createdAt: 1_700_000_000_000,
    tokenVersion: 1,
    ...overrides,
  }
}

describe('account store', () => {
  it('opens an absent file as an empty account set and stores its first account', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    const store = await AccountStore.open(path)
    expect(store.isEmpty).toBe(true)
    expect(store.all()).toEqual([])

    const created = await store.add({ username: 'first', email: 'first@example.com' }, 'password-1')
    expect(store.isEmpty).toBe(false)
    expect(store.all()).toHaveLength(1)
    expect(created.username).toBe('first')
    expect(created.email).toBe('first@example.com')
    expect(created.tokenVersion).toBe(1)
    expect(store.byId(created.id)).toEqual(created)
    expect(store.byUsername('first')).toEqual(created)
    expect(store.byEmail('first@example.com')).toEqual(created)
    expect(store.byIdentifier('first')).toEqual(created)
    expect(store.byIdentifier('first@example.com')).toEqual(created)
    expect(store.byId('missing')).toBeUndefined()
    expect(store.byUsername('missing')).toBeUndefined()
    expect(store.byEmail('other@example.com')).toBeUndefined()
    expect(store.byIdentifier('missing')).toBeUndefined()
    expect(await verifyPassword('password-1', created.password)).toBe(true)

    const mode = (await stat(path)).mode & 0o777
    expect(mode).toBe(0o600)
    const reopened = await AccountStore.open(path)
    expect(reopened.all()).toEqual([created])
  })

  it('stores an account with no address and lets one be added later', async () => {
    const base = await home()
    const store = await AccountStore.open(join(base, 'auth', 'accounts.json'))
    const created = await store.add({ username: 'solo' }, 'password-1')
    expect(created.email).toBeNull()
    expect(store.byIdentifier('solo')).toEqual(created)
    expect(store.byIdentifier('solo@example.com')).toBeUndefined()

    const addressed = await store.update(created.id, current => ({ ...current, email: 'solo@example.com' }))
    expect(addressed.email).toBe('solo@example.com')
    expect(store.byIdentifier('solo@example.com')).toEqual(addressed)
  })

  it('reads an account file whose records stored only addresses', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    await mkdir(join(base, 'auth'), { recursive: true })
    await writeFile(path, JSON.stringify({ version: 1, accounts: [legacyRecord()] }))
    const store = await AccountStore.open(path)
    // The address becomes the login name, so the account keeps signing in.
    expect(store.all()).toEqual([{
      id: 'legacy-1',
      username: 'first@example.com',
      email: 'first@example.com',
      password: 'scrypt$32768$8$1$AAAA$AAAA',
      createdAt: 1_700_000_000_000,
      tokenVersion: 1,
    }])
    expect(store.byIdentifier('first@example.com')).toEqual(store.byUsername('first@example.com'))
  })

  it('replaces one account through a change function', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    const store = await AccountStore.open(path)
    const created = await store.add({ username: 'first', email: 'first@example.com' }, 'password-1')
    const changed = await store.update(created.id, current => ({
      ...current,
      username: 'renamed',
      email: 'renamed@example.com',
      tokenVersion: current.tokenVersion + 1,
    }))
    expect(changed.username).toBe('renamed')
    expect(changed.email).toBe('renamed@example.com')
    expect(store.byIdentifier('renamed')).toEqual(changed)
    expect(store.byUsername('first')).toBeUndefined()
    expect(store.byEmail('first@example.com')).toBeUndefined()
    const document = JSON.parse(await readFile(path, 'utf8')) as { version: number; accounts: AccountRecord[] }
    expect(document.version).toBe(2)
    expect(document.accounts).toEqual([changed])
  })

  it('updates one account while leaving its siblings untouched', async () => {
    const base = await home()
    const store = await AccountStore.open(join(base, 'auth', 'accounts.json'))
    const first = await store.add({ username: 'first', email: 'first@example.com' }, 'password-1')
    const second = await store.add({ username: 'second', email: 'second@example.com' }, 'password-2')
    const changed = await store.update(first.id, current => ({ ...current, tokenVersion: 2 }))
    expect(store.all()).toEqual([changed, second])
  })

  it('refuses to update an account that no longer exists', async () => {
    const base = await home()
    const store = await AccountStore.open(join(base, 'auth', 'accounts.json'))
    await expect(store.update('missing', current => current)).rejects.toThrow(/no account missing/u)
  })

  it('replaces one password and retires the sessions the previous one issued', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    const store = await AccountStore.open(path)
    const created = await store.add({ username: 'first' }, 'password-1')

    const changed = await store.setPassword(created.id, 'password-2')
    expect(changed.id).toBe(created.id)
    expect(changed.tokenVersion).toBe(created.tokenVersion + 1)
    expect(await verifyPassword('password-1', changed.password)).toBe(false)
    expect(await verifyPassword('password-2', changed.password)).toBe(true)

    const reopened = await AccountStore.open(path)
    expect(reopened.byId(created.id)).toEqual(changed)
    await expect(store.setPassword('missing', 'password-3')).rejects.toThrow(/no account missing/u)
  })

  it('removes one account and leaves its siblings in place', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    const store = await AccountStore.open(path)
    const first = await store.add({ username: 'first' }, 'password-1')
    const second = await store.add({ username: 'second' }, 'password-2')

    const removed = await store.remove(first.id)
    expect(removed).toEqual(first)
    expect(store.all()).toEqual([second])
    expect(store.byUsername('first')).toBeUndefined()

    const reopened = await AccountStore.open(path)
    expect(reopened.all()).toEqual([second])
    await expect(store.remove(first.id)).rejects.toThrow(/no account/u)
  })

  it('refuses a file this build did not write', async () => {
    const base = await home()
    const path = join(base, 'accounts.json')
    const cases: readonly (readonly [string, string])[] = [
      ['not JSON', '{'],
      ['unknown version', JSON.stringify({ version: 3, accounts: [] })],
      ['no accounts array', JSON.stringify({ version: 2, accounts: {} })],
      ['a non-record entry', JSON.stringify({ version: 2, accounts: ['account'] })],
      ['a missing id', JSON.stringify({ version: 2, accounts: [record({ id: '' })] })],
      ['a missing username', JSON.stringify({ version: 2, accounts: [record({ username: undefined })] })],
      ['an empty username', JSON.stringify({ version: 2, accounts: [record({ username: '' })] })],
      ['a non-string email', JSON.stringify({ version: 2, accounts: [record({ email: 7 })] })],
      ['an empty email', JSON.stringify({ version: 2, accounts: [record({ email: '' })] })],
      ['an empty password', JSON.stringify({ version: 2, accounts: [record({ password: '' })] })],
      ['a fractional creation time', JSON.stringify({ version: 2, accounts: [record({ createdAt: 1.5 })] })],
      ['a missing token version', JSON.stringify({ version: 2, accounts: [record({ tokenVersion: undefined })] })],
      ['a v1 record with no address', JSON.stringify({ version: 1, accounts: [legacyRecord({ email: undefined })] })],
      ['a v1 record with an empty address', JSON.stringify({ version: 1, accounts: [legacyRecord({ email: '' })] })],
    ]
    for (const [name, text] of cases) {
      await writeFile(path, text)
      await expect(AccountStore.open(path), name).rejects.toThrow(/accounts-local/u)
    }
  })

  it('propagates a read failure that is not an absent file', async () => {
    const base = await home()
    await mkdir(join(base, 'auth', 'accounts.json'), { recursive: true })
    await expect(AccountStore.open(join(base, 'auth', 'accounts.json'))).rejects.toThrow(/EISDIR|illegal operation/u)
  })

  it('keeps the previous account set when the successor write fails', async () => {
    const base = await home()
    const directory = join(base, 'auth')
    await mkdir(directory, { recursive: true })
    const store = await AccountStore.open(join(directory, 'accounts.json'))
    const created = await store.add({ username: 'first', email: 'first@example.com' }, 'password-1')
    await chmod(directory, 0o500)
    try {
      await expect(store.add({ username: 'second', email: 'second@example.com' }, 'password-2'))
        .rejects.toThrow(/EACCES|permission denied/u)
      expect(store.all()).toEqual([created])
    } finally {
      await chmod(directory, 0o700)
    }
  })

  it('composes a change with what another writer stored first', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    // Two writers, each holding the snapshot that predates the other's change:
    // the account file is the one document a deployment shares.
    const alice = await AccountStore.open(path)
    const bob = await AccountStore.open(path)
    await alice.add({ username: 'alice' }, 'password-1')
    const created = await bob.add({ username: 'bob' }, 'password-2')
    const document = JSON.parse(await readFile(path, 'utf8')) as { accounts: readonly AccountRecord[] }
    expect(document.accounts.map(account => account.username)).toEqual(['alice', 'bob'])
    // The writer that read last sees both, because it read under the lock
    // rather than writing back the snapshot it opened with.
    expect(bob.all().map(account => account.id)).toContain(created.id)
    expect(bob.all()).toHaveLength(2)
  })

  it('serializes two changes that start at the same time', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    const store = await AccountStore.open(path)
    const [alice, bob] = await Promise.all([
      store.add({ username: 'alice' }, 'password-1'),
      store.add({ username: 'bob' }, 'password-2'),
    ])
    const document = JSON.parse(await readFile(path, 'utf8')) as { accounts: readonly AccountRecord[] }
    expect(document.accounts.map(account => account.username).sort()).toEqual(['alice', 'bob'])
    expect(store.all().map(account => account.username).sort()).toEqual(['alice', 'bob'])
    expect(alice.id).not.toBe(bob.id)
  })

  it('decides the name and address rules over the file the write lands in', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    const first = await AccountStore.open(path)
    const second = await AccountStore.open(path)
    await first.add({ username: 'first', email: 'first@example.com' }, 'password-1')
    const taken = await second.add({ username: 'first' }, 'password-2').then(() => undefined, (error: unknown) => error)
    expect(taken).toBeInstanceOf(AccountConflictError)
    expect((taken as AccountConflictError).kind).toBe('username')
    const addressed = await second.add({ username: 'other', email: 'first@example.com' }, 'password-3')
      .then(() => undefined, (error: unknown) => error)
    expect(addressed).toBeInstanceOf(AccountConflictError)
    expect((addressed as AccountConflictError).kind).toBe('email')
    // Neither refused change reached the file, so it still holds one account.
    expect((await AccountStore.open(path)).all()).toHaveLength(1)
  })

  it('creates the first account only while the file is still empty', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    const store = await AccountStore.open(path)
    const first = await store.initialize({ username: 'first' }, 'password-1')
    expect(store.all()).toEqual([first])
    const late = await store.initialize({ username: 'second' }, 'password-2').then(() => undefined, (error: unknown) => error)
    expect(late).toBeInstanceOf(AccountConflictError)
    expect((late as AccountConflictError).kind).toBe('initialized')
    expect(store.all()).toEqual([first])
  })

  it('treats a lock no waiter holds any more as residue and takes it', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    await mkdir(join(base, 'auth'), { recursive: true })
    const lock = `${path}.lock`
    await writeFile(lock, '')
    const past = new Date(Date.now() - 60_000)
    await utimes(lock, past, past)
    const store = await AccountStore.open(path)
    const created = await store.add({ username: 'first' }, 'password-1')
    expect(store.byId(created.id)).toEqual(created)
    // The lock the dead writer left is gone with the change it guarded.
    await expect(stat(lock)).rejects.toThrow(/ENOENT/u)
  })

  it('waits for a lock another writer holds and then finishes the change', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    await mkdir(join(base, 'auth'), { recursive: true })
    const lock = `${path}.lock`
    await writeFile(lock, '')
    const store = await AccountStore.open(path)
    const pending = store.add({ username: 'first' }, 'password-1')
    await new Promise((resolve) => { setTimeout(resolve, 100) })
    await rm(lock)
    const created = await pending
    expect(store.byId(created.id)).toEqual(created)
  })

  it('reads a lock path that leads nowhere as no lock at all', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    await mkdir(join(base, 'auth'), { recursive: true })
    // The path is taken but names nothing: a holder removed it between the
    // failed attempt and the read, or something else made the path a link.
    await symlink(join(base, 'gone'), `${path}.lock`)
    const store = await AccountStore.open(path)
    const pending = store.add({ username: 'first' }, 'password-1')
    await new Promise((resolve) => { setTimeout(resolve, 100) })
    await rm(`${path}.lock`)
    const created = await pending
    expect(store.byId(created.id)).toEqual(created)
  })

  it('refuses a change while another writer holds the lock past the deadline', { timeout: 20_000 }, async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    await mkdir(join(base, 'auth'), { recursive: true })
    const lock = `${path}.lock`
    await writeFile(lock, '')
    const store = await AccountStore.open(path)
    await expect(store.add({ username: 'first' }, 'password-1')).rejects.toThrow(/another writer holds/u)
    expect(store.all()).toEqual([])
  })

  it('marks one account as the deployment administrator and refuses a second seat', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    const store = await AccountStore.open(path)
    const admin = await store.add({ username: 'root' }, 'password-1', { admin: true })
    expect(admin.admin).toBe(true)
    // An ordinary account carries no seat at all, not a false one.
    const member = await store.add({ username: 'member' }, 'password-1')
    expect(member.admin).toBeUndefined()
    await expect(store.add({ username: 'other' }, 'password-1', { admin: true }))
      .rejects.toMatchObject({ kind: 'admin' })
    // The seat survives a reopen, and the refusal left the set as it was.
    const reopened = await AccountStore.open(path)
    expect(reopened.all().map(account => [account.username, account.admin === true]))
      .toEqual([['root', true], ['member', false]])
  })

  it('lets exactly one of two administrator requests through', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    const store = await AccountStore.open(path)
    // The seat is decided against the set the write lands on, so the two
    // submissions cannot both find the deployment without an administrator.
    const settled = await Promise.allSettled([
      store.add({ username: 'one' }, 'password-1', { admin: true }),
      store.add({ username: 'two' }, 'password-1', { admin: true }),
    ])
    expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const refused = settled.filter(result => result.status === 'rejected')
    expect(refused[0]?.reason).toMatchObject({ kind: 'admin' })
    expect((await AccountStore.open(path)).all().filter(account => account.admin === true)).toHaveLength(1)
  })

  it('refuses a stored administrator flag that is not true', async () => {
    const base = await home()
    await mkdir(join(base, 'auth'), { recursive: true })
    const path = join(base, 'auth', 'accounts.json')
    await writeFile(path, JSON.stringify({ version: 2, accounts: [{ ...record(), admin: 'yes' }] }))
    await expect(AccountStore.open(path)).rejects.toThrow(/malformed account record/u)
  })
})
