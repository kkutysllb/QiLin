/**
 * The editor's asynchronous half: reading the whole file, saving it back.
 *
 * The component never awaits anything. It calls `readFile` / `saveFile`, and
 * this face performs the calls and writes the outcome through the store's own
 * actions — the Slot-standard `inject` shape, so the write set stays the
 * store's. The session travels inside `file`: it comes from the tab's
 * address, whose session authorizes the read and the write, not from the
 * slot's.
 *
 * One tab has one call in force: a reload while a read is still out, or a
 * save overtaken by another, retires the older call, whose settlement then
 * writes nothing. Cleanup rides the owner's `signal`, armed by the tab's
 * first call: the abort forgets the bucket and this bookkeeping, a request is
 * not made for a record that already ended, and a settlement arriving after
 * the record is gone has nothing left to write to.
 * @module
 */
import type { BoundActions } from '@qilin/client-store'
import type { RemoteResult } from '@qilin/api-remotes/client'
import type { WorkspaceFileStat } from '@qilin/api-workspace-files/types'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { SessionId } from '@qilin/session/types'
import type { WholeFileResult } from './file-pages.ts'
import type { SessionFile } from './file-guard.ts'
import type { createFilesStore } from './store.ts'

/** The bound `workspaceFiles.write` call, as the generated client declares it. */
export type WriteWorkspaceFile = (
  sessionId: SessionId,
  path: string,
  text: string,
  request: { readonly baseVersion?: string },
  signal: AbortSignal,
) => Promise<RemoteResult<WorkspaceFileStat>>

/** What one save writes against. */
export interface SaveOptions {
  /** The version the text was read at; refused with `workspace-file/stale` when the disk moved on. */
  readonly baseVersion: string
  /** `true` omits `baseVersion`: the conflict's overwrite. */
  readonly force: boolean
}

/** The editor's injected face, as the body receives it. */
export interface FileEditorInjected {
  /**
   * Read the whole file into the store, resetting the editor's bucket.
   * @param tabId - the tab being drawn.
   * @param file - the session and path the tab's address names.
   * @param signal - the tab record's lifetime.
   */
  readonly readFile: (tabId: TabId, file: SessionFile, signal: AbortSignal) => void
  /**
   * Save one text as the file's content.
   * @param tabId - the tab being drawn.
   * @param file - the session and path the tab's address names.
   * @param text - the complete text to write.
   * @param options - the version written against, or a forced overwrite.
   * @param signal - the tab record's lifetime.
   */
  readonly saveFile: (
    tabId: TabId,
    file: SessionFile,
    text: string,
    options: SaveOptions,
    signal: AbortSignal,
  ) => void
}

/**
 * Bind the editor's face to one whole-file read and one write.
 * @param readWhole - the paged whole-file read.
 * @param write - the bound `workspaceFiles.write` call.
 * @returns the Slot `inject` factory: session and bound actions in, face out.
 */
export function fileEditFace(
  readWhole: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<WholeFileResult>,
  write: WriteWorkspaceFile,
): (sessionId: SessionId, actions: BoundActions<ReturnType<typeof createFilesStore>>) => FileEditorInjected {
  return (_sessionId: SessionId, actions: BoundActions<ReturnType<typeof createFilesStore>>): FileEditorInjected => {
    /** Per tab: the call generation a settlement must match; the latest wins. */
    const generations = new Map<TabId, number>()
    const nextGeneration = (tabId: TabId): number => {
      const generation = (generations.get(tabId) ?? 0) + 1
      generations.set(tabId, generation)
      return generation
    }
    // Reached with a live signal only: the record's end forgets the tab's
    // bucket and this bookkeeping in one listener, however often it arms.
    const arm = (tabId: TabId, signal: AbortSignal): void => {
      if (generations.has(tabId)) return
      signal.addEventListener('abort', () => {
        generations.delete(tabId)
        actions.editForget(tabId)
      }, { once: true })
    }
    return {
      readFile(tabId, file, signal) {
        if (signal.aborted) return
        arm(tabId, signal)
        const generation = nextGeneration(tabId)
        actions.editRead(tabId)
        void readWhole(file.sessionId, file.path, signal).then((result) => {
          if (signal.aborted || generations.get(tabId) !== generation) return
          if (result.ok) actions.editLoaded(tabId, result.value.text, result.value.version)
          else actions.editFailed(tabId, result.error)
        })
      },
      saveFile(tabId, file, text, options, signal) {
        if (signal.aborted) return
        arm(tabId, signal)
        const generation = nextGeneration(tabId)
        actions.editSaving(tabId)
        const request = options.force ? {} : { baseVersion: options.baseVersion }
        void write(file.sessionId, file.path, text, request, signal).then((result) => {
          if (signal.aborted || generations.get(tabId) !== generation) return
          if (result.ok) actions.editSaved(tabId, text, result.value.version)
          else actions.editSaveFailed(tabId, result.error)
        })
      },
    }
  }
}
