import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionId, SessionLogOffset, SessionSeq } from '@qilin-agent/session'
import { SessionPersistenceRevision } from '@qilin-agent/session-persistence'
import { ReconcileStaging, reconcileStagingPath } from '../src/staging.ts'

const directories: string[] = []

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

async function harness(): Promise<{ store: ReconcileStaging; file: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'qilin-search-staging-'))
  directories.push(directory)
  const file = join(directory, 'index.db.staging')
  return { store: new ReconcileStaging(file), file }
}

function record(revision: string): Parameters<ReconcileStaging['append']>[0] {
  return {
    header: { version: 5, id: SessionId('staged'), createdAt: 1, isSeeded: false },
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
  it('stays beside a durable index and moves to the OS temp directory for :memory:', () => {
    expect(reconcileStagingPath('/data/index.db', 'instance')).toBe('/data/index.db.staging')
    expect(reconcileStagingPath(':memory:', 'instance')).toMatch(/qilin-session-search-.*-instance\.staging$/u)
  })
})

describe('ReconcileStaging', () => {
  it('streams staged sessions back in append order and skips empty lines', async () => {
    const { store, file } = await harness()
    await store.reset()
    await store.append(record('first'))
    await store.append(record('second'))
    await writeFile(file, `${await readFile(file, 'utf8')}\n`)
    const revisions: string[] = []
    for await (const staged of store.records()) revisions.push(staged.revision)
    expect(revisions).toEqual(['first', 'second'])
    await store.dispose()
  })

  it('removes the file on reset and on dispose', async () => {
    const { store, file } = await harness()
    await store.reset()
    await store.append(record('first'))
    await expect(stat(file)).resolves.toBeDefined()
    await store.reset()
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
    // An absent file is a no-op for both operations.
    await store.reset()
    await store.append(record('second'))
    await store.dispose()
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
    await store.dispose()
  })
})
