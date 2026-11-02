/**
 * Bounded-memory staging for one reconcile observation. A full-corpus cold
 * read used to retain every changed session's extracted documents until the
 * single insert transaction; this writes them to a private file instead and
 * streams them back during that transaction. The file is derived data: it is
 * truncated before each observation attempt and removed once the reconcile
 * settles.
 * @module @qilin-agent/session-query-sqlite/src/staging
 */

import { createReadStream } from 'node:fs'
import { open, rm, type FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
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
 * Private file path for one index database's staging.
 * @param dbPath - configured index path; `:memory:` gets an OS-temp path.
 * @param instance - per-engine instance id, keeping temp paths distinct.
 * @returns absolute staging path.
 */
export function reconcileStagingPath(dbPath: string, instance: string): string {
  return dbPath === ':memory:'
    ? join(tmpdir(), `qilin-session-search-${process.pid}-${instance}.staging`)
    : `${dbPath}.staging`
}

/** One reconcile's staged sessions, written and read back in observation order. */
export class ReconcileStaging {
  private handle: FileHandle | undefined

  /** @param file - absolute staging path owned by this engine. */
  constructor(private readonly file: string) {}

  /** Discard this attempt's staged sessions and start a new attempt. */
  async reset(): Promise<void> {
    await this.closeHandle()
    await rm(this.file, { force: true })
  }

  /**
   * Stage one session's documents; the observed copy is released afterwards.
   * @param record - detached header, revision, and documents.
   */
  async append(record: StagedSession): Promise<void> {
    this.handle ??= await open(this.file, 'a', 0o600)
    await this.handle.write(`${JSON.stringify(record)}\n`)
  }

  /**
   * Iterate the staged sessions in observation order.
   * @returns one detached session per staged line.
   */
  async *records(): AsyncGenerator<StagedSession> {
    await this.closeHandle()
    const stream = createReadStream(this.file, { encoding: 'utf8' })
    const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY })
    try {
      for await (const line of lines) {
        if (line !== '') yield JSON.parse(line) as StagedSession
      }
    } finally {
      lines.close()
      stream.destroy()
    }
  }

  /** Close the handle and remove the file. */
  async dispose(): Promise<void> {
    await this.closeHandle()
    await rm(this.file, { force: true })
  }

  private async closeHandle(): Promise<void> {
    const handle = this.handle
    this.handle = undefined
    if (handle !== undefined) await handle.close()
  }
}
