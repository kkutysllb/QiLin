/**
 * The `qilin tenants` roster commands: creating, re-keying, and retiring the
 * accounts every tenant runtime on one Harness home shares.
 *
 * A tenant runtime admits exactly the account it serves, so its own Web surface
 * cannot create a second account; these commands are the only way a deployment
 * grows its roster.
 */

import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountStore, accountsFilePath } from '@qilin-agent/accounts-local'
import {
  addAccount,
  removeAccount,
  rosterEntries,
  runTenantsRoster,
  setAccountPassword,
  type RosterRequest,
} from '../src/tenants-roster.ts'

let root: string | undefined

afterEach(async () => {
  vi.restoreAllMocks()
  if (root !== undefined) await rm(root, { recursive: true, force: true, maxRetries: 3 })
  root = undefined
})

/** Create one fresh temporary shared Harness home. */
async function home(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'qilin-tenants-roster-'))
  return root
}

/** Whether a path exists. */
async function exists(path: string): Promise<boolean> {
  return await stat(path).then(() => true, () => false)
}

/** Run one roster subcommand against a home, capturing what it printed. */
async function run(base: string, request: RosterRequest): Promise<{ code: number; out: string; err: string }> {
  const previous = process.env.QILIN_HOME
  process.env.QILIN_HOME = base
  const out: string[] = []
  const err: string[] = []
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array): boolean => {
    out.push(String(chunk))
    return true
  })
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array): boolean => {
    err.push(String(chunk))
    return true
  })
  try {
    return { code: await runTenantsRoster(request), out: out.join(''), err: err.join('') }
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
    if (previous === undefined) delete process.env.QILIN_HOME
    else process.env.QILIN_HOME = previous
  }
}

describe('tenants roster', () => {
  it('creates an account under its normalized name and gives it a tenant directory', async () => {
    const base = await home()
    const created = await addAccount(base, { username: '  Alice ', email: ' Alice@Example.COM ', password: 'alice-password' })

    expect(created.username).toBe('alice')
    expect(created.email).toBe('alice@example.com')
    const store = await AccountStore.open(accountsFilePath(base))
    expect(store.byUsername('alice')).toEqual(created)

    // An unattended run with no piped password is refused rather than waiting.
    const unpiped = await run(base, { command: 'add', username: 'bob', email: undefined, admin: false, password: { kind: 'prompt' } })
    expect(unpiped.code).toBe(1)
    expect(unpiped.err).toMatch(/not a terminal/u)
  })

  it('creates the deployment administrator once and refuses a second seat', async () => {
    const base = await home()
    const created = await addAccount(base, { username: 'root', password: 'root-password', admin: true })
    expect(created.admin).toBe(true)
    // The seat is durable: a fresh read of the shared roster carries it.
    expect((await AccountStore.open(accountsFilePath(base))).byUsername('root')?.admin).toBe(true)

    // A second request for the seat is refused where the write lands, and it
    // leaves the roster exactly as it was.
    await expect(addAccount(base, { username: 'other', password: 'other-password', admin: true }))
      .rejects.toThrow(/already has an administrator/u)
    expect((await AccountStore.open(accountsFilePath(base))).all()).toHaveLength(1)
  })

  it('refuses a name, address, or password the account surface would not accept', async () => {
    const base = await home()
    await expect(addAccount(base, { username: 'a', password: 'long-enough' })).rejects.toThrow(/not an acceptable username/u)
    await expect(addAccount(base, { username: 'alice', password: 'short' })).rejects.toThrow(/at least 8 characters/u)
    await expect(addAccount(base, { username: 'alice', email: 'not-an-address', password: 'long-enough' })).rejects.toThrow(/not an acceptable email/u)

    const first = await addAccount(base, { username: 'alice', email: 'alice@example.com', password: 'alice-password' })
    await expect(addAccount(base, { username: 'ALICE', password: 'other-password' })).rejects.toThrow(/already exists/u)
    await expect(addAccount(base, { username: 'mallory', email: 'ALICE@example.com', password: 'other-password' }))
      .rejects.toThrow(/already belongs to an account/u)

    const store = await AccountStore.open(accountsFilePath(base))
    expect(store.all()).toEqual([first])
  })

  it('replaces a password, retiring the sessions the previous one issued', async () => {
    const base = await home()
    const created = await addAccount(base, { username: 'alice', password: 'alice-password' })
    const changed = await setAccountPassword(base, 'Alice', 'alice-password-2')
    expect(changed.id).toBe(created.id)
    expect(changed.tokenVersion).toBe(created.tokenVersion + 1)
    expect(changed.password).not.toBe(created.password)

    await expect(setAccountPassword(base, 'mallory', 'long-enough')).rejects.toThrow(/no account is named mallory/u)
    await expect(setAccountPassword(base, 'alice', 'short')).rejects.toThrow(/at least 8 characters/u)
  })

  it('keeps a retired account\'s Sessions on disk unless the purge is asked for', async () => {
    const base = await home()
    const created = await addAccount(base, { username: 'alice', password: 'alice-password' })
    const directory = join(base, 'tenants', created.id)
    await mkdir(join(directory, 'sessions'), { recursive: true })

    const kept = await removeAccount(base, 'alice', false)
    expect(kept.account.id).toBe(created.id)
    expect(kept.purgedDirectory).toBeUndefined()
    expect(await exists(directory)).toBe(true)
    expect((await AccountStore.open(accountsFilePath(base))).all()).toEqual([])
    await expect(removeAccount(base, 'alice', false)).rejects.toThrow(/no account is named alice/u)
  })

  it('purges the tenant directory only when the purge is asked for', async () => {
    const base = await home()
    const created = await addAccount(base, { username: 'alice', password: 'alice-password' })
    const directory = join(base, 'tenants', created.id)
    await mkdir(join(directory, 'sessions'), { recursive: true })

    const purged = await removeAccount(base, 'alice', true)
    expect(purged.purgedDirectory).toBe(directory)
    expect(await exists(directory)).toBe(false)
  })

  it('refuses to purge a directory that is not the account tenant directory', async () => {
    const base = await home()
    const store = await AccountStore.open(accountsFilePath(base))
    const created = await store.add({ username: 'alice' }, 'alice-password')
    // The roster is a shared document another writer can edit, so an identity
    // that is a path segment of its own must not name the directory this
    // deployment deletes.
    await store.update(created.id, account => ({ ...account, id: '../outside' }))
    const reachable = join(base, 'outside', 'sessions')
    await mkdir(reachable, { recursive: true })

    await expect(removeAccount(base, 'alice', true)).rejects.toThrow(/which is not this account's tenant directory/u)
    expect(await exists(reachable)).toBe(true)
    expect((await AccountStore.open(accountsFilePath(base))).all()).toHaveLength(1)
  })

  it('reports which accounts already have a tenant directory', async () => {
    const base = await home()
    const alice = await addAccount(base, { username: 'alice', password: 'alice-password' })
    const bob = await addAccount(base, { username: 'bob', email: 'bob@example.com', password: 'bob-password' })
    await mkdir(join(base, 'tenants', alice.id), { recursive: true })

    const entries = await rosterEntries(base)
    expect(entries.map(entry => [entry.username, entry.tenantDataPresent])).toEqual([['alice', true], ['bob', false]])
    expect(entries[1]?.tenantDirectory).toBe(join(base, 'tenants', bob.id))
    expect(entries[1]?.email).toBe('bob@example.com')
  })

  it('lists the roster, answers an empty home, and fails loud on a retired account', async () => {
    const base = await home()
    const empty = await run(base, { command: 'accounts' })
    expect(empty.code).toBe(0)
    expect(empty.out).toMatch(/has no accounts yet/u)

    await addAccount(base, { username: 'alice', email: 'alice@example.com', password: 'alice-password' })
    const listed = await run(base, { command: 'accounts' })
    expect(listed.code).toBe(0)
    expect(listed.out).toMatch(/USERNAME/u)
    expect(listed.out).toMatch(/alice/u)
    expect(listed.out).toMatch(/alice@example.com/u)

    const retired = await run(base, { command: 'remove', username: 'alice', purgeData: false })
    expect(retired.code).toBe(0)
    expect(retired.out).toMatch(/retired alice/u)
    expect(retired.out).toMatch(/its Sessions stay in/u)

    const missing = await run(base, { command: 'remove', username: 'alice', purgeData: false })
    expect(missing.code).toBe(1)
    expect(missing.err).toMatch(/no account is named alice/u)
  })
})
