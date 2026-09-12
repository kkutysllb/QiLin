/** The durable account file: parsing, mutation, and the state a failed write leaves behind. */

import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AccountStore, type AccountRecord } from '../src/accounts.ts'
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

/** One well-formed stored account, before any field is corrupted. */
function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'account-1',
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

    const created = await store.add('first@example.com', 'password-1')
    expect(store.isEmpty).toBe(false)
    expect(store.all()).toHaveLength(1)
    expect(created.email).toBe('first@example.com')
    expect(created.tokenVersion).toBe(1)
    expect(store.byId(created.id)).toEqual(created)
    expect(store.byEmail('first@example.com')).toEqual(created)
    expect(store.byId('missing')).toBeUndefined()
    expect(store.byEmail('other@example.com')).toBeUndefined()
    expect(await verifyPassword('password-1', created.password)).toBe(true)

    const mode = (await stat(path)).mode & 0o777
    expect(mode).toBe(0o600)
    const reopened = await AccountStore.open(path)
    expect(reopened.all()).toEqual([created])
  })

  it('replaces one account through a change function', async () => {
    const base = await home()
    const path = join(base, 'auth', 'accounts.json')
    const store = await AccountStore.open(path)
    const created = await store.add('first@example.com', 'password-1')
    const changed = await store.update(created.id, current => ({
      ...current,
      email: 'renamed@example.com',
      tokenVersion: current.tokenVersion + 1,
    }))
    expect(changed.email).toBe('renamed@example.com')
    expect(store.byEmail('renamed@example.com')).toEqual(changed)
    expect(store.byEmail('first@example.com')).toBeUndefined()
    const document = JSON.parse(await readFile(path, 'utf8')) as { version: number; accounts: AccountRecord[] }
    expect(document.version).toBe(1)
    expect(document.accounts).toEqual([changed])
  })

  it('updates one account while leaving its siblings untouched', async () => {
    const base = await home()
    const store = await AccountStore.open(join(base, 'auth', 'accounts.json'))
    const first = await store.add('first@example.com', 'password-1')
    const second = await store.add('second@example.com', 'password-2')
    const changed = await store.update(first.id, current => ({ ...current, tokenVersion: 2 }))
    expect(store.all()).toEqual([changed, second])
  })

  it('refuses to update an account that no longer exists', async () => {
    const base = await home()
    const store = await AccountStore.open(join(base, 'auth', 'accounts.json'))
    await expect(store.update('missing', current => current)).rejects.toThrow(/no account missing/u)
  })

  it('refuses a file this build did not write', async () => {
    const base = await home()
    const path = join(base, 'accounts.json')
    const cases: readonly (readonly [string, string])[] = [
      ['not JSON', '{'],
      ['unknown version', JSON.stringify({ version: 2, accounts: [] })],
      ['no accounts array', JSON.stringify({ version: 1, accounts: {} })],
      ['a non-record entry', JSON.stringify({ version: 1, accounts: ['account'] })],
      ['a missing id', JSON.stringify({ version: 1, accounts: [record({ id: '' })] })],
      ['a non-string email', JSON.stringify({ version: 1, accounts: [record({ email: 7 })] })],
      ['an empty password', JSON.stringify({ version: 1, accounts: [record({ password: '' })] })],
      ['a fractional creation time', JSON.stringify({ version: 1, accounts: [record({ createdAt: 1.5 })] })],
      ['a missing token version', JSON.stringify({ version: 1, accounts: [record({ tokenVersion: undefined })] })],
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
    const created = await store.add('first@example.com', 'password-1')
    await chmod(directory, 0o500)
    try {
      await expect(store.add('second@example.com', 'password-2')).rejects.toThrow(/EACCES|permission denied/u)
      expect(store.all()).toEqual([created])
    } finally {
      await chmod(directory, 0o700)
    }
  })
})
