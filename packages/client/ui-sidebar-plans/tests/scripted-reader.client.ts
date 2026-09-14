/**
 * A virtual workspace the scan reads, and the mocks that report what it asked
 * for.
 *
 * The scan is pure over its reader, so a spec drives the whole convention —
 * which directories exist, which documents they hold, what their heads say,
 * and which call fails — without a filesystem.
 */
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import { RemoteError } from '@qilin/client-test-runtime'

import type {
  WorkspaceDirectoryEntry, WorkspaceDirectoryListing, WorkspaceFileStat, WorkspaceFileText,
} from '@qilin/api-workspace-files/types'
import type { PlanReader } from '../src/client/plans.ts'

/** The virtual workspace one scripted reader answers from. */
export interface VirtualWorkspace {
  /** Absolute directory path → its direct children; an absent path answers `not-found`. */
  readonly dirs?: Record<string, readonly WorkspaceDirectoryEntry[]>
  /** Absolute document path → the text its first page answers with. */
  readonly heads?: Record<string, string>
  /** Absolute path → the failure its `list` and `stat` answer with instead of the virtual content. */
  readonly failures?: Record<string, RemoteFailure>
  /** Absolute document path → the failure its `read` answers with. */
  readonly headFailures?: Record<string, RemoteFailure>
}

/** The scripted reader and the mocks behind it. */
export interface ScriptedReader {
  readonly reader: PlanReader
  readonly list: Mock<PlanReader['list']>
  readonly read: Mock<PlanReader['read']>
  readonly stat: Mock<PlanReader['stat']>
}

/** Build one `not-found` result for a path the virtual workspace does not hold. */
function absent(path: string): RemoteFailure {
  return new RemoteError('workspace-file/not-found', 'gone', { path })
}

/**
 * Build a reader over one virtual workspace.
 * @param workspace - the directories, heads, and failures the scan will find.
 * @returns the reader plus the mocks it answers through.
 */
export function scriptedReader(workspace: VirtualWorkspace = {}): ScriptedReader {
  const { dirs = {}, heads = {}, failures = {}, headFailures = {} } = workspace
  const list = vi.fn<PlanReader['list']>(async (_sessionId, path) => {
    const failure = failures[path]
    if (failure !== undefined) return { ok: false, error: failure }
    const entries = dirs[path]
    if (entries === undefined) return { ok: false, error: absent(path) }
    const listing: WorkspaceDirectoryListing = { path: '', entries, truncated: false }
    return { ok: true, value: listing }
  })
  const stat = vi.fn<PlanReader['stat']>(async (_sessionId, path) => {
    const failure = failures[path]
    if (failure !== undefined) return { ok: false, error: failure }
    if (heads[path] === undefined) return { ok: false, error: absent(path) }
    const value: WorkspaceFileStat = { absolutePath: path, version: 'v1' }
    return { ok: true, value }
  })
  const read = vi.fn<PlanReader['read']>(async (_sessionId, path) => {
    const failure = headFailures[path]
    if (failure !== undefined) return { ok: false, error: failure }
    const value: WorkspaceFileText = {
      absolutePath: path, version: 'v1', offset: 1, lines: 1, eof: true, text: heads[path] ?? '',
    }
    return { ok: true, value }
  })
  return { reader: { list, read, stat }, list, read, stat }
}
