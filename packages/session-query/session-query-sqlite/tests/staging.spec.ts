import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SESSION_FORMAT_VERSION, SessionId, SessionLogOffset, SessionSeq } from '@qilin-agent/session'
import { SessionPersistenceRevision } from '@qilin-agent/session-persistence'
import { ReconcileStaging, reconcileStagingPath } from '../src/staging.ts'

const directories: string[] = []

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

async function harness(): Promise<{ store: ReconcileStaging; directory: string }> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-search-staging-'))
  directories.push(root)
  const directory = join(root, 'index.db.staging')
  return { store: new ReconcileStaging(directory), directory }
}

function record(revision: string): Parameters<ReconcileStaging['append']>[0] {
  return {
    header: { version: SESSION_FORMAT_VERSION, id: SessionId('staged'), createdAt: 1, isSeeded: false },
    inheritedEventCount: SessionLogOffset(0),
    revision: SessionPersistenceRevision(revision),
    documents: [{
      sessionId: SessionId('staged'),
      seq: SessionSeq(0),
      type: 'user/message',
      time: 1,
      surface: 'current',
      text: 'needle',
    }],
  }
}

describe('reconcileStagingPath', () => {
  it('stays beside a durable index and moves to the VFS temp directory for :memory:', () => {
    expect(reconcileStagingPath('/data/index.db', 'instance')).toBe('/data/index.db.staging')
    expect(reconcileStagingPath(':memory:', 'instance')).toMatch(/qilin-session-search-instance\.staging$/u)
  })
})

describe('ReconcileStaging', () => {
  it('stages one private file per session and reads them back in observation order', async () => {
    const { store, directory } = await harness()
    // Nothing staged yet: the directory does not exist and iteration yields nothing.
    const empty: string[] = []
    for await (const staged of store.records()) empty.push(staged.revision)
    expect(empty).toEqual([])
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' })

    await store.reset()
    await store.append(record('first'))
    await store.append(record('second'))
    expect(await readdir(directory)).toEqual(['00000000.json', '00000001.json'])
    const revisions: string[] = []
    for await (const staged of store.records()) revisions.push(staged.revision)
    expect(revisions).toEqual(['first', 'second'])
    await store.dispose()
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('clears the directory on reset and dispose, including an absent one', async () => {
    const { store, directory } = await harness()
    await store.reset()
    await store.append(record('first'))
    await expect(stat(directory)).resolves.toBeDefined()
    await store.reset()
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' })
    await store.reset()
    await store.append(record('second'))
    await store.dispose()
    await expect(stat(directory)).rejects.toMatchObject({ code: 'ENOENT' })
    await store.dispose()
  })

  it('rethrows a staging path that cannot be listed instead of reporting nothing staged', async () => {
    const { store, directory } = await harness()
    // A regular file at the staging path fails readdir with ENOTDIR, not ENOENT.
    await writeFile(directory, 'not a directory')
    const staged: string[] = []
    await expect(async () => {
      for await (const entry of store.records()) staged.push(entry.revision)
    }).rejects.toMatchObject({ code: 'ENOTDIR' })
    expect(staged).toEqual([])
  })
})
