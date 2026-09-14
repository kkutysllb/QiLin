/** A whole-file read and a write the spec settles by hand, one deferred per call. */
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { SessionId } from '@qilin/session/types'
import type { WorkspaceFileStat } from '@qilin/api-workspace-files/types'
import type { RemoteResult } from '@qilin/api-remotes/client'
import type { WriteWorkspaceFile } from '../src/client/file-face.ts'
import type { WholeFileResult } from '../src/client/file-pages.ts'

/** The whole-file read the face binds to. */
type ReadWhole = (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<WholeFileResult>

/** The scripted pair: the mocks the face receives, and the hands that settle them. */
export interface ScriptedEdit {
  readonly readWhole: Mock<ReadWhole>
  readonly write: Mock<WriteWorkspaceFile>
  /** Settle the oldest outstanding read. */
  readonly settleRead: (result: WholeFileResult) => Promise<void>
  /** Settle the oldest outstanding write. */
  readonly settleWrite: (result: RemoteResult<WorkspaceFileStat>) => Promise<void>
}

/**
 * Build a read/write pair whose every call stays pending until the spec settles it.
 * @returns the scripted pair.
 */
export function scriptedEdit(): ScriptedEdit {
  const pendingReads: Array<(result: WholeFileResult) => void> = []
  const pendingWrites: Array<(result: RemoteResult<WorkspaceFileStat>) => void> = []
  const readWhole: Mock<ReadWhole> = vi.fn((_sessionId: SessionId, _path: string, _signal: AbortSignal) =>
    new Promise<WholeFileResult>((resolve) => { pendingReads.push(resolve) }))
  const write: Mock<WriteWorkspaceFile> = vi.fn((
    _sessionId: SessionId, _path: string, _text: string,
    _request: { readonly baseVersion?: string }, _signal: AbortSignal,
  ) => new Promise<RemoteResult<WorkspaceFileStat>>((resolve) => { pendingWrites.push(resolve) }))
  const land = async <R>(settle: ((result: R) => void) | undefined, result: R): Promise<void> => {
    if (settle === undefined) throw new Error('no outstanding call to settle')
    settle(result)
    await Promise.resolve()
    await Promise.resolve()
  }
  return {
    readWhole,
    write,
    settleRead: result => land(pendingReads.shift(), result),
    settleWrite: result => land(pendingWrites.shift(), result),
  }
}
