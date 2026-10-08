/**
 * The row mutations and the tab reconciliation, scripted and recorded.
 *
 * Every Remote call stays pending until the spec settles it, so what the face
 * writes between the call and its settlement is observable; the reconciliation
 * is a pair of recorders, because what matters is which tabs one moved or
 * removed path was settled against.
 */
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { RemoteResult } from '@qilin-agent/api-remotes/client'
import type { SessionId } from '@qilin-agent/session/types'
import { createTabReconcile } from '../src/client/file-mutations.ts'
import type {
  OpenTabRef, SidebarTabReconcile, TabReconcile, WorkspaceFileMutations,
} from '../src/client/file-mutations.ts'

/** One scripted call: the mock the face receives, and the hand that settles it. */
export interface ScriptedCall<T extends unknown[]> {
  readonly mock: Mock<(...args: T) => Promise<RemoteResult<unknown>>>
  /** Settle the oldest outstanding call and let its settlement land. */
  readonly settle: (result: RemoteResult<unknown>) => Promise<void>
  /** Arguments of the calls not yet settled, oldest first. */
  readonly outstanding: () => readonly unknown[][]
}

/** One pending call awaiting the spec's answer. */
interface Pending {
  readonly args: unknown[]
  resolve(result: RemoteResult<unknown>): void
}

/** Build one call whose every invocation stays pending until the spec settles it. */
function scriptedCall<T extends unknown[]>(): ScriptedCall<T> {
  const pending: Pending[] = []
  const mock: Mock<(...args: T) => Promise<RemoteResult<unknown>>> = vi.fn((...args: unknown[]) =>
    new Promise<RemoteResult<unknown>>((resolve) => {
      pending.push({ args, resolve })
    }))
  return {
    mock,
    settle: async (result) => {
      const call = pending.shift()
      if (call === undefined) throw new Error('no outstanding call to settle')
      call.resolve(result)
      await Promise.resolve()
      await Promise.resolve()
    },
    outstanding: () => pending.map(call => call.args),
  }
}

/** The four scripted row mutations, as the tree's face receives them. */
export interface ScriptedMutations {
  readonly mutations: WorkspaceFileMutations
  readonly createFile: ScriptedCall<[SessionId, string, AbortSignal]>
  readonly createDirectory: ScriptedCall<[SessionId, string, AbortSignal]>
  readonly move: ScriptedCall<[SessionId, string, string, AbortSignal]>
  readonly remove: ScriptedCall<[SessionId, string, boolean, AbortSignal]>
}

/**
 * Build the four row mutations, each pending until the spec settles it.
 * @returns the scripted mutations.
 */
export function scriptedMutations(): ScriptedMutations {
  const createFile = scriptedCall<[SessionId, string, AbortSignal]>()
  const createDirectory = scriptedCall<[SessionId, string, AbortSignal]>()
  const move = scriptedCall<[SessionId, string, string, AbortSignal]>()
  const remove = scriptedCall<[SessionId, string, boolean, AbortSignal]>()
  return {
    createFile,
    createDirectory,
    move,
    remove,
    mutations: {
      createFile: (sessionId, path, signal) => createFile.mock(sessionId, path, signal),
      createDirectory: (sessionId, path, signal) => createDirectory.mock(sessionId, path, signal),
      move: (sessionId, from, to, signal) => move.mock(sessionId, from, to, signal),
      remove: (sessionId, path, recursive, signal) => remove.mock(sessionId, path, recursive, signal),
    },
  }
}

/** What one reconciliation recorded: the tabs it was given and the calls it made. */
export interface RecordedReconcile {
  readonly reconcile: TabReconcile
  readonly tabsIn: Mock<(sessionId: SessionId) => readonly OpenTabRef[]>
  readonly openResourceIn: Mock<SidebarTabReconcile['openResourceIn']>
  readonly closeIn: Mock<SidebarTabReconcile['closeIn']>
  /** Replace the tabs every later `tabsIn` call answers with. */
  readonly openTabs: (tabs: readonly OpenTabRef[]) => void
}

/**
 * Build the real reconciliation over a recording Sidebar.
 * @param tabs - the tabs every `tabsIn` call answers with.
 * @returns the reconciliation and its recorders.
 */
export function recordedReconcile(tabs: readonly OpenTabRef[] = []): RecordedReconcile {
  let committed = tabs
  const tabsIn = vi.fn<(sessionId: SessionId) => readonly OpenTabRef[]>(() => committed)
  const openResourceIn = vi.fn<SidebarTabReconcile['openResourceIn']>()
  const closeIn = vi.fn<SidebarTabReconcile['closeIn']>()
  return {
    reconcile: createTabReconcile({ tabsIn, openResourceIn, closeIn }),
    tabsIn,
    openResourceIn,
    closeIn,
    openTabs: (next) => { committed = next },
  }
}
