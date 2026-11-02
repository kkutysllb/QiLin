/**
 * Bounded-memory staging for one reconcile observation. A full-corpus cold
 * read used to retain every changed session's extracted documents until the
 * single insert transaction; this writes them as one private file per session
 * and streams them back during that transaction. The directory is derived data:
 * it is cleared before each observation attempt and removed once the reconcile
 * settles.
 *
 * The layout uses only `fs/promises`, `os`, and `path`: the browser preview runs
 * this backend inside the web worker's VFS, which serves those modules and not
 * `node:readline`.
 * @module @qilin-agent/session-query-sqlite/src/staging
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SessionEventSearchDocument } from '@qilin-agent/session-query'
import type { SessionHeader, SessionLogOffset } from '@qilin-agent/session'
import type { SessionPersistenceRevision } from '@qilin-agent/session-persistence'

/** One staged changed session, ready for the insert transaction. */
export interface StagedSession {
  readonly header: SessionHeader
  readonly inheritedEventCount: SessionLogOffset
  readonly revision: SessionPersistenceRevision
  readonly documents: readonly SessionEventSearchDocument[]
}

/**
 * Private staging directory for one index database.
 * @param dbPath - configured index path; `:memory:` gets a VFS temp directory.
 * @param instance - per-engine instance id, keeping temp paths distinct.
 * @returns absolute staging directory.
 */
export function reconcileStagingPath(dbPath: string, instance: string): string {
  return dbPath === ':memory:'
    ? join(tmpdir(), `qilin-session-search-${instance}.staging`)
    : `${dbPath}.staging`
}

/** One reconcile's staged sessions, written and read back in observation order. */
export class ReconcileStaging {
  private next = 0

  /** @param directory - absolute staging directory owned by this engine. */
  constructor(private readonly directory: string) {}

  /** Discard this attempt's staged sessions and start a new attempt. */
  async reset(): Promise<void> {
    this.next = 0
    await rm(this.directory, { recursive: true, force: true })
  }

  /**
   * Stage one session's documents; the observed copy is released afterwards.
   * @param record - detached header, revision, and documents.
   */
  async append(record: StagedSession): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const name = `${String(this.next).padStart(8, '0')}.json`
    this.next += 1
    await writeFile(join(this.directory, name), JSON.stringify(record), { mode: 0o600 })
  }

  /**
   * Iterate the staged sessions in observation order.
   * @returns one detached session per staged file; nothing was staged when absent.
   */
  async *records(): AsyncGenerator<StagedSession> {
    let names: string[]
    try {
      names = await readdir(this.directory)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    for (const name of names.sort()) {
      yield JSON.parse(await readFile(join(this.directory, name), 'utf8')) as StagedSession
    }
  }

  /** Remove the staged directory. */
  async dispose(): Promise<void> {
    this.next = 0
    await rm(this.directory, { recursive: true, force: true })
  }
}
