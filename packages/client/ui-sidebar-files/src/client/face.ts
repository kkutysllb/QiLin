/**
 * The tree's asynchronous half: listing directories into the store.
 *
 * The component never awaits anything. It calls `start` / `load` / `toggle`, and
 * this face performs the listing and writes the outcome through the store's own
 * actions — the Slot-standard `inject` shape, so the session id is resolved by
 * the framework and the write set stays the store's.
 *
 * The listing itself is bound here to the Client Remote face: the tree keys
 * every level by absolute path and hands the endpoint that same absolute path;
 * the endpoint answers with the directory's workspace-relative path as well,
 * which the tree has no use for and drops.
 *
 * One level has one listing in force: asking for a level again — the reload
 * gesture, a directory reopened after a reset — retires the listing still in
 * flight for it, whose settlement then writes nothing. Cleanup rides the owner's
 * `signal`: a request is not made for a record that already ended, and when the
 * record goes away the bucket and the tab's listing bookkeeping are forgotten,
 * so no later settlement writes to it.
 */
import type { ClientRemote, RemoteResult } from '@qilin/api-remotes/client'
import type { BoundActions } from '@qilin/client-store'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { WorkspaceFileNameSearch } from '@qilin/api-workspace-files/types'
import type { SessionId } from '@qilin/session/types'
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
 * The absolute path of one child entry.
 *
 * Joined with `/` whatever the parent's separators: the Host resolves mixed
 * separators, and the tree only needs a stable key.
 * @param parent - absolute path of the listed directory.
 * @param name - the entry's basename.
 * @returns the child's absolute path.
 */
export function childPath(parent: string, name: string): string {
  return `${parent.replace(/[/\\]+$/, '')}/${name}`
}

/** The tree's injected business face, as the body receives it. */
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
}

/**
 * Bind the tree's face to one directory listing and one filename search.
 * @param list - the bound `workspaceFiles.list` call.
 * @param searchNames - the bound `workspaceFiles.searchNames` call.
 * @returns the Slot `inject` factory: session and bound actions in, face out.
 */
export function filesFace(
  list: ListWorkspaceDirectory,
  searchNames: SearchWorkspaceFileNames,
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
    return {
      start(tabId, root, signal) {
        actions.start(tabId, root)
        signal.addEventListener('abort', () => {
          const waiting = settling.get(tabId)
          if (waiting !== undefined) clearTimeout(waiting)
          settling.delete(tabId)
          queryGenerations.delete(tabId)
          generations.delete(tabId)
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
    }
  }
}
