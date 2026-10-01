/** A filename search the spec settles by hand, one deferred result per call. */
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { RemoteResult } from '@qilin/api-remotes/client'
import type { WorkspaceFileNameSearch } from '@qilin/api-workspace-files/types'
import type { SearchWorkspaceFileNames } from '../src/client/face.ts'

/** The scripted search: the mock the face receives, and the hand that settles it. */
export interface ScriptedSearch {
  readonly search: Mock<SearchWorkspaceFileNames>
  /**
   * Settle the oldest outstanding call and let its store write land.
   * @param result - what the endpoint answers.
   */
  readonly settle: (result: RemoteResult<WorkspaceFileNameSearch>) => Promise<void>
  /** Queries of calls not yet settled, oldest first. */
  readonly queries: () => readonly string[]
}

/** One search awaiting the spec's answer. */
interface PendingSearch {
  readonly query: string
  resolve(result: RemoteResult<WorkspaceFileNameSearch>): void
}

/**
 * Build a search whose every call stays pending until the spec settles it.
 * @returns the scripted search.
 */
export function scriptedSearch(): ScriptedSearch {
  const pending: PendingSearch[] = []
  const search = vi.fn<SearchWorkspaceFileNames>((_sessionId, query) =>
    new Promise((resolve) => { pending.push({ query, resolve }) }))
  const settle = async (call: PendingSearch | undefined, result: RemoteResult<WorkspaceFileNameSearch>): Promise<void> => {
    if (call === undefined) throw new Error('no outstanding search to settle')
    call.resolve(result)
    await Promise.resolve()
    await Promise.resolve()
  }
  return {
    search,
    settle: result => settle(pending.shift(), result),
    queries: () => pending.map(call => call.query),
  }
}
