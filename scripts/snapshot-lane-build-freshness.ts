/** Prove the snapshot lane replays against a build produced from the current sources. */

import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CLIENT_BUILD_RECORD_PATH } from './client-build-environment.ts'

/** Directories whose contents decide whether built `lib/` is current with the sources. */
const SOURCE_ROOTS = ['packages', 'apps/web/src'] as const

/** Directories that carry no source a replay subprocess loads. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'lib', 'dist', '__snapshots__', 'tests', 'generated'])

/** Newest source file discovered under one build-affecting root. */
export interface SnapshotNewestSource {
  /** Repository-relative path of the newest source file. */
  readonly path: string
  /** Modification time of that file, in milliseconds since the epoch. */
  readonly mtimeMs: number
}

/** Build record state and the newest source that may have changed since it was written. */
export interface SnapshotLaneBuildFreshness {
  /** Repository-relative path of the build record that stamps the last complete build. */
  readonly recordPath: string
  /** Modification time of that record, in milliseconds since the epoch. */
  readonly recordMtimeMs: number
  /** Newest build-affecting source file, or `undefined` when the tree has none. */
  readonly newestSource: SnapshotNewestSource | undefined
  /** Whether a source file is newer than the build record. */
  readonly stale: boolean
}

/**
 * Walk one source root and keep the newest file that a build consumes.
 *
 * @param absolute - Directory to walk.
 * @param root - Repository root used to shorten reported paths.
 * @param current - Newest file found so far.
 * @returns the newest file found at or below `absolute`.
 */
function newestFile(absolute: string, root: string, current: SnapshotNewestSource | undefined):
SnapshotNewestSource | undefined {
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(absolute, { withFileTypes: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code
    if (code === 'ENOENT') return current
    throw error
  }
  let newest = current
  for (const entry of entries) {
    const path = join(absolute, entry.name)
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue
      newest = newestFile(path, root, newest)
      continue
    }
    if (!entry.isFile()) continue
    if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue
    const mtimeMs = statSync(path).mtimeMs
    if (newest === undefined || mtimeMs > newest.mtimeMs) {
      newest = { path: path.slice(root.length + 1), mtimeMs }
    }
  }
  return newest
}

/**
 * Compare the last complete build against the sources the snapshot lane replays.
 *
 * @param root - Repository root holding the build record and the sources.
 * @returns the build record state and the newest source; `stale` reports an edit after the last build.
 */
export function inspectSnapshotLaneBuildFreshness(root: string): SnapshotLaneBuildFreshness {
  const recordPath = CLIENT_BUILD_RECORD_PATH
  const absoluteRecord = resolve(root, recordPath)
  let recordMtimeMs: number
  try {
    recordMtimeMs = statSync(absoluteRecord).mtimeMs
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code
    if (code !== 'ENOENT') throw error
    throw new Error(
      `test:snapshot: no build record at ${recordPath}; the lane loads built lib/, so run pnpm run build first`,
    )
  }
  let newestSource: SnapshotNewestSource | undefined
  for (const relativeRoot of SOURCE_ROOTS) newestSource = newestFile(resolve(root, relativeRoot), root, newestSource)
  return {
    recordPath,
    recordMtimeMs,
    newestSource,
    stale: newestSource !== undefined && newestSource.mtimeMs > recordMtimeMs,
  }
}

/** Outcome reported by {@link assertSnapshotLaneBuildFresh}. */
export interface SnapshotLaneBuildGate {
  /** Freshness facts the gate inspected. */
  readonly freshness: SnapshotLaneBuildFreshness
  /** Whether the gate allowed a stale build through its explicit override. */
  readonly staleAccepted: boolean
}

/**
 * Fail loudly when the build the snapshot lane loads predates the sources it replays.
 *
 * @param root - Repository root holding the build record and the sources.
 * @param options - Override that accepts a stale build.
 * @returns the inspected freshness facts.
 */
export function assertSnapshotLaneBuildFresh(
  root: string,
  options: { allowStale?: boolean } = {},
): SnapshotLaneBuildGate {
  const freshness = inspectSnapshotLaneBuildFreshness(root)
  const staleAccepted = freshness.stale && options.allowStale === true
  if (freshness.stale && !staleAccepted) {
    const newest = freshness.newestSource
    throw new Error(
      `test:snapshot: build is stale — ${newest?.path ?? 'a source file'} is newer than ${freshness.recordPath}; `
      + 'the lane loads built lib/, so run pnpm run build first',
    )
  }
  if (staleAccepted) {
    console.warn(
      `test:snapshot: replaying a stale build (${freshness.newestSource?.path ?? 'a source file'} is newer than `
      + `${freshness.recordPath}); QILIN_SNAPSHOT_ALLOW_STALE_BUILD=1 accepts behavior the sources no longer produce`,
    )
  }
  return { freshness, staleAccepted }
}

/** Environment flag that accepts a stale build explicitly. */
export const SNAPSHOT_ALLOW_STALE_BUILD_ENV = 'QILIN_SNAPSHOT_ALLOW_STALE_BUILD'

if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..')
  const staleAccepted = process.env[SNAPSHOT_ALLOW_STALE_BUILD_ENV] === '1'
  const { freshness } = assertSnapshotLaneBuildFresh(root, { allowStale: staleAccepted })
  if (!freshness.stale) console.log(`test:snapshot: build record ${freshness.recordPath} is current with the sources`)
}
