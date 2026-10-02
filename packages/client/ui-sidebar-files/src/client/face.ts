/**
 * The tree's asynchronous half: listing directories into the store, and the
 * row mutations that change what a directory holds.
 *
 * The component never awaits anything. It calls `start` / `load` / `toggle` /
 * `search` / `createEntry` / `renameEntry` / `removeEntry`, and this face
 * performs the work and writes the outcome through the store's own actions —
 * the Slot-standard `inject` shape, so the session id is resolved by the
 * framework and the write set stays the store's.
 *
 * The listing itself is bound here to the Client Remote face: the tree keys
 * every level by absolute path and hands the endpoint that same absolute path;
 * the endpoint answers with the directory's workspace-relative path as well,
 * which the tree has no use for and drops. The mutations are bound the same
 * way, and their successful settlement re-lists the directory that held the
 * entry and reconciles the tabs open on the touched path.
 *
 * One level has one listing in force, and one tab has one mutation in force:
 * asking for a level again — the reload gesture, a directory reopened after a
 * reset — retires the listing still in flight for it, and a newer gesture
 * retires the mutation still out, whose settlement then writes nothing.
 * Cleanup rides the owner's `signal`: a request is not made for a record that
 * already ended, and when the record goes away the bucket and the tab's
 * listing bookkeeping are forgotten, so no later settlement writes to it.
 */
import type { ClientRemote, RemoteResult } from '@qilin/api-remotes/client'
import type { BoundActions } from '@qilin/client-store'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { WorkspaceFileNameSearch } from '@qilin/api-workspace-files/types'
import type { SessionId } from '@qilin/session/types'
import { joinEntryPath, parentDirectoryOf } from './file-mutations.ts'
import type { EntryKind, TabReconcile, WorkspaceFileMutations } from './file-mutations.ts'
import type { DirLevel, createFilesStore } from './store.ts'

/**
 * One directory listing, bound to a Remote face.
 *
 * The session travels with the call because the endpoint resolves the workspace
 * root from it: the same path means different directories in different sessions.
 * A Remote call does not reject — the result carries the failure.
 */
export type ListWorkspaceDirectory = (
  sessionId: SessionId,
  path: string,
  signal: AbortSignal,
) => Promise<RemoteResult<DirLevel>>

/**
 * One filename search, bound to a Remote face.
 *
 * The query is matched against basenames below the same workspace root the
 * listing is rooted at, and the answer is workspace-relative paths.
 */
export type SearchWorkspaceFileNames = (
  sessionId: SessionId,
  query: string,
  signal: AbortSignal,
) => Promise<RemoteResult<WorkspaceFileNameSearch>>

/**
 * The slice of the Client Remote face this package calls: the `workspaceFiles`
 * namespace's `list` and `searchNames`, exactly as the Host's generated client
 * declares them.
 */
export type WorkspaceFilesTreeRemote = {
  readonly workspaceFiles: Pick<ClientRemote['workspaceFiles'], 'list' | 'searchNames'>
}

/**
 * Bind the listing to one Remote face, keeping only what the tree stores.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace's `list`.
 * @returns the listing the tree's face performs.
 */
export function createList(
  remote: { readonly workspaceFiles: Pick<ClientRemote['workspaceFiles'], 'list'> },
): ListWorkspaceDirectory {
  return async (sessionId, path, signal) => {
    const result = await remote.workspaceFiles.list(sessionId, path, signal)
    if (!result.ok) return result
    return { ok: true, value: { entries: result.value.entries, truncated: result.value.truncated } }
  }
}

/**
 * How long the box settles before a query reaches the Host. Keystrokes that
 * arrive inside the window replace the pending query instead of asking the
 * Host for a prefix nobody wants finished.
 */
export const SEARCH_SETTLE_MS = 200

/**
 * Bind the filename search to one Remote face, dropping the entries this
 * package does not draw.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace's `searchNames`.
 * @returns the search the tree's face performs.
 */
export function createSearch(
  remote: { readonly workspaceFiles: Pick<ClientRemote['workspaceFiles'], 'searchNames'> },
): SearchWorkspaceFileNames {
  return (sessionId, query, signal) => remote.workspaceFiles.searchNames(sessionId, query, signal)
}

/**
 * The tree's injected business face, as the body receives it.
 */
export interface FilesInjected {
  /**
   * Seed this tab's tree and list its root.
   * @param tabId - the tab being drawn.
   * @param root - absolute path of the workspace root.
   * @param signal - the tab record's lifetime.
   */
  readonly start: (tabId: TabId, root: string, signal: AbortSignal) => void
  /**
   * List one directory into the store.
   * @param tabId - the tab being drawn.
   * @param path - absolute directory path.
   * @param signal - the tab record's lifetime.
   */
  readonly load: (tabId: TabId, path: string, signal: AbortSignal) => void
  /**
   * Open or collapse one directory, listing it the first time it opens.
   * @param tabId - the tab being drawn.
   * @param path - absolute directory path.
   * @param loaded - whether this level already has state.
   * @param signal - the tab record's lifetime.
   */
  readonly toggle: (tabId: TabId, path: string, loaded: boolean, signal: AbortSignal) => void
  /**
   * Ask for the files whose names contain one query, after the box settles.
   * @param tabId - the tab being drawn.
   * @param query - the box's text, exactly as typed; blank asks nothing.
   * @param signal - the tab record's lifetime.
   */
  readonly search: (tabId: TabId, query: string, signal: AbortSignal) => void
  /**
   * Create one empty file or one directory inside a listed directory.
   * @param tabId - the tab being drawn.
   * @param directory - absolute path of the directory to create the entry in.
   * @param name - the entry name, already normalized by the caller.
   * @param kind - whether to write an empty file or make a directory.
   * @param signal - the tab record's lifetime.
   */
  readonly createEntry: (
    tabId: TabId,
    directory: string,
    name: string,
    kind: EntryKind,
    signal: AbortSignal,
  ) => void
  /**
   * Rename one entry in place, keeping it in its own directory.
   * @param tabId - the tab being drawn.
   * @param path - absolute path of the entry to rename.
   * @param name - the entry name, already normalized by the caller.
   * @param root - absolute workspace root, which the tabs' addresses are relative to.
   * @param signal - the tab record's lifetime.
   */
  readonly renameEntry: (tabId: TabId, path: string, name: string, root: string, signal: AbortSignal) => void
  /**
   * Delete one entry; a directory goes with everything inside it.
   * @param tabId - the tab being drawn.
   * @param path - absolute path of the entry to delete.
   * @param kind - whether the entry is a directory, which decides `recursive`.
   * @param root - absolute workspace root, which the tabs' addresses are relative to.
   * @param signal - the tab record's lifetime.
   */
  readonly removeEntry: (tabId: TabId, path: string, kind: EntryKind, root: string, signal: AbortSignal) => void
}

/**
 * Bind the tree's face to one directory listing, one filename search, and the
 * row mutations.
 * @param list - the bound `workspaceFiles.list` call.
 * @param searchNames - the bound `workspaceFiles.searchNames` call.
 * @param mutations - the bound create, move, and remove calls.
 * @param reconcile - how a touched path is settled against the open tabs.
 * @returns the Slot `inject` factory: session and bound actions in, face out.
 */
export function filesFace(
  list: ListWorkspaceDirectory,
  searchNames: SearchWorkspaceFileNames,
  mutations: WorkspaceFileMutations,
  reconcile: TabReconcile,
): (sessionId: SessionId, actions: BoundActions<ReturnType<typeof createFilesStore>>) => FilesInjected {
  return (
    sessionId: SessionId,
    actions: BoundActions<ReturnType<typeof createFilesStore>>,
  ): FilesInjected => {
    /** Per tab, per absolute path: the listing generation a settlement must match; the latest request wins. */
    const generations = new Map<TabId, Map<string, number>>()
    const nextGeneration = (tabId: TabId, path: string): number => {
      const byPath = generations.get(tabId) ?? new Map<string, number>()
      generations.set(tabId, byPath)
      const generation = (byPath.get(path) ?? 0) + 1
      byPath.set(path, generation)
      return generation
    }
    const load = (tabId: TabId, path: string, signal: AbortSignal): void => {
      if (signal.aborted) return
      const generation = nextGeneration(tabId, path)
      actions.loading(tabId, path)
      void list(sessionId, path, signal).then((result) => {
        // A newer listing of this level was asked for since, or the record is
        // gone and its bookkeeping with it: nothing left for this one to write.
        if (generations.get(tabId)?.get(path) !== generation) return
        if (result.ok) actions.loaded(tabId, path, result.value)
        else actions.failed(tabId, path, result.error)
      })
    }
    /**
     * Per tab, the settled-query generation an answer must match: the newest
     * text wins, and an answer for replaced text is dropped rather than shown.
     */
    const queryGenerations = new Map<TabId, number>()
    /** Per tab, the settle timer still waiting to ask the Host. */
    const settling = new Map<TabId, ReturnType<typeof setTimeout>>()
    const searchQuery = (tabId: TabId, query: string, signal: AbortSignal): void => {
      if (signal.aborted) return
      const generation = (queryGenerations.get(tabId) ?? 0) + 1
      queryGenerations.set(tabId, generation)
      const waiting = settling.get(tabId)
      if (waiting !== undefined) clearTimeout(waiting)
      const needle = query.trim()
      if (needle === '') {
        settling.delete(tabId)
        actions.searchCleared(tabId)
        return
      }
      settling.set(tabId, setTimeout(() => {
        settling.delete(tabId)
        if (queryGenerations.get(tabId) !== generation) return
        actions.searchRunning(tabId, query)
        void searchNames(sessionId, needle, signal).then((result) => {
          if (queryGenerations.get(tabId) !== generation) return
          if (result.ok) actions.searchSettled(tabId, query, result.value.matches, result.value.truncated)
          else actions.searchFailed(tabId, query, result.error)
        })
      }, SEARCH_SETTLE_MS))
    }
    /**
     * Per tab, the mutation generation a settlement must match: the newest
     * gesture wins, and an answer for a replaced one is dropped rather than
     * written or re-listed.
     */
    const mutationGenerations = new Map<TabId, number>()
    const mutate = (
      tabId: TabId,
      signal: AbortSignal,
      call: () => Promise<RemoteResult<unknown>>,
      settle: () => void,
    ): void => {
      if (signal.aborted) return
      const generation = (mutationGenerations.get(tabId) ?? 0) + 1
      mutationGenerations.set(tabId, generation)
      actions.mutationStarted(tabId)
      void call().then((result) => {
        // A newer gesture was asked for since, or the record is gone and its
        // bookkeeping with it: nothing left for this one to write or reload.
        if (signal.aborted || mutationGenerations.get(tabId) !== generation) return
        if (!result.ok) {
          actions.mutationFailed(tabId, result.error)
          return
        }
        actions.mutationCleared(tabId)
        settle()
      })
    }
    return {
      start(tabId, root, signal) {
        actions.start(tabId, root)
        signal.addEventListener('abort', () => {
          const waiting = settling.get(tabId)
          if (waiting !== undefined) clearTimeout(waiting)
          settling.delete(tabId)
          queryGenerations.delete(tabId)
          generations.delete(tabId)
          mutationGenerations.delete(tabId)
          actions.forget(tabId)
        }, { once: true })
        load(tabId, root, signal)
      },
      load,
      toggle(tabId, path, loaded, signal) {
        actions.toggled(tabId, path)
        if (!loaded) load(tabId, path, signal)
      },
      search(tabId, query, signal) {
        searchQuery(tabId, query, signal)
      },
      createEntry(tabId, directory, name, kind, signal) {
        const path = joinEntryPath(directory, name)
        mutate(
          tabId,
          signal,
          () => kind === 'file'
            ? mutations.createFile(sessionId, path, signal)
            : mutations.createDirectory(sessionId, path, signal),
          () => { load(tabId, directory, signal) },
        )
      },
      renameEntry(tabId, path, name, root, signal) {
        // A rename keeps the entry in its directory, so a path naming no
        // directory is a caller that never had a row to act on.
        const directory = parentDirectoryOf(path)
        if (directory === '') throw new Error(`ui-sidebar-files: "${path}" has no parent directory`)
        const destination = joinEntryPath(directory, name)
        mutate(
          tabId,
          signal,
          () => mutations.move(sessionId, path, destination, signal),
          () => {
            reconcile.moved(sessionId, root, path, destination)
            load(tabId, directory, signal)
          },
        )
      },
      removeEntry(tabId, path, kind, root, signal) {
        // As for a rename: a removed entry is named under a directory.
        const directory = parentDirectoryOf(path)
        if (directory === '') throw new Error(`ui-sidebar-files: "${path}" has no parent directory`)
        mutate(
          tabId,
          signal,
          () => mutations.remove(sessionId, path, kind === 'directory', signal),
          () => {
            reconcile.removed(sessionId, root, path)
            load(tabId, directory, signal)
          },
        )
      },
    }
  }
}
