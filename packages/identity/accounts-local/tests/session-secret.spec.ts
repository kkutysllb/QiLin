/** The deployment's session secret: one key for every runtime serving one deployment. */

import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadSessionSecret, sessionSecretPath, type AccountRecord } from '../src/accounts.ts'
import { SessionCookies } from '../src/session.ts'

const ACCOUNT: AccountRecord = {
  id: 'account-1',
  username: 'first',
  email: 'first@example.com',
  password: 'scrypt$32768$8$1$AAAA$AAAA',
  createdAt: 1_700_000_000_000,
  tokenVersion: 1,
}

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** A deployment home of its own. */
async function deploymentHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-deployment-secret-'))
  roots.push(root)
  return root
}

describe('deployment session secret', () => {
  it('creates one key for the deployment, beside its roster and readable by no one else', async () => {
    const home = await deploymentHome()
    const first = await loadSessionSecret(home)
    const second = await loadSessionSecret(home)

    expect(first).toHaveLength(32)
    expect(second.equals(first)).toBe(true)
    expect(sessionSecretPath(home)).toBe(join(home, 'auth', 'session-secret.json'))
    expect((await stat(sessionSecretPath(home))).mode & 0o777).toBe(0o600)
    expect((await stat(join(home, 'auth'))).mode & 0o777).toBe(0o700)
    // A different deployment signs its sessions with a different key.
    expect((await loadSessionSecret(await deploymentHome())).equals(first)).toBe(false)
  })

  it('gives two runtimes of one deployment the same key, whatever their own homes are', async () => {
    const deployment = await deploymentHome()
    // A tenant runtime's own harness home is not the deployment's: the tenant
    // keeps sessions, settings, and credentials under its own directory, and
    // still has to accept the session the landing page signed.
    const tenant = await deploymentHome()
    const previous = process.env.QILIN_HOME
    process.env.QILIN_HOME = tenant
    try {
      const landing = await loadSessionSecret(deployment)
      const account = await loadSessionSecret(deployment)
      expect(account.equals(landing)).toBe(true)
      // The key belongs to the deployment: it is written under the deployment's
      // own home, and the tenant's home holds no copy of its own.
      await expect(access(sessionSecretPath(deployment))).resolves.toBeUndefined()
      await expect(access(join(tenant, 'auth', 'session-secret.json'))).rejects.toThrow()
      // A session one runtime issues is one the other verifies.
      const issued = new SessionCookies(landing, 60_000).issue('127.0.0.1:8790', ACCOUNT, Date.now())
      // A session is read from the request's own authority and cookie header.
      const read = new SessionCookies(account, 60_000).read({
        headers: { host: '127.0.0.1:8790', cookie: issued.split(';', 1)[0] as string },
      })
      expect(read?.subject).toBe(ACCOUNT.id)
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, 'QILIN_HOME')
      else process.env.QILIN_HOME = previous
    }
  })

  it('settles two runtimes that create it at the same moment on one key', async () => {
    const home = await deploymentHome()
    const [left, right] = await Promise.all([loadSessionSecret(home), loadSessionSecret(home)])

    expect(left.equals(right)).toBe(true)
    const stored = JSON.parse(await readFile(sessionSecretPath(home), 'utf8')) as { version: number; secret: string }
    expect(stored.version).toBe(1)
    expect(Buffer.from(stored.secret, 'base64url').equals(left)).toBe(true)
  })

  it('lets a read failure that is not an absent document through', async () => {
    const home = await deploymentHome()
    // A directory where the document belongs is not a first run: the secret
    // cannot be read and cannot be replaced by a fresh one either.
    await mkdir(sessionSecretPath(home), { recursive: true })
    await expect(loadSessionSecret(home)).rejects.toThrow(/EISDIR|illegal operation/u)
  })

  it('lets a write failure that is not an existing document through', async () => {
    const home = await deploymentHome()
    const directory = join(home, 'auth')
    await mkdir(directory, { recursive: true })
    await chmod(directory, 0o500)
    try {
      await expect(loadSessionSecret(home)).rejects.toThrow(/EACCES|permission denied/u)
    } finally {
      await chmod(directory, 0o700)
    }
  })

  it('refuses a document that disappears while it was created', async () => {
    const home = await deploymentHome()
    const path = sessionSecretPath(home)
    const directory = join(home, 'auth')
    await mkdir(directory, { recursive: true })
    // A dangling link reads as absent yet refuses exclusive creation, which is
    // the race: the document the winner wrote is gone by the raced read.
    await symlink(join(directory, 'missing-target'), path)
    await expect(loadSessionSecret(home)).rejects.toThrow(/stored session secret disappeared while it was created/u)
  })

  it('refuses a document it cannot use instead of signing with a guess', async () => {
    const home = await deploymentHome()
    const path = sessionSecretPath(home)
    await mkdir(join(home, 'auth'), { recursive: true })
    const unusable = [
      'not json',
      '[]',
      '{"version":2,"secret":"AAAA"}',
      `{"version":1,"secret":"${Buffer.alloc(8, 1).toString('base64url')}"}`,
      `{"version":1,"secret":"${Buffer.alloc(32, 1).toString('base64url')}="}`,
    ]
    for (const content of unusable) {
      await writeFile(path, content, { mode: 0o600 })
      await expect(loadSessionSecret(home), content).rejects.toThrow(/stored session secret/u)
    }
  })
})
