/**
 * The two view states this package owns, one store per session, bucketed by
 * tab id because two tabs in one session are independent:
 *
 * - the file tree: which directories are expanded, and what each loaded level
 *   contains. Shared by the `files` page and the `file` editor's tree pane.
 * - the file editor: one open file's load state, draft, and save state.
 *
 * Writers run between `start` and `forget` (tree) or the editor face's abort
 * listener (editor): the owner's `signal` is what ends a bucket's life, and
 * the faces stop dispatching once it aborts.
 */
import { defineStore, type EngineStoreHandle } from '@qilin/client-store'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { WorkspaceDirectoryEntry } from '@qilin/api-workspace-files/types'

/**
 * One directory's contents, as one expanded level of the tree.
 *
 * The endpoint's listing also names the directory as a workspace-relative path;
 * the tree keys every level by absolute path instead, so the adapter drops it.
 */
export interface DirLevel {
  /** The directory's entries, in the endpoint's order. */
  readonly entries: readonly WorkspaceDirectoryEntry[]
  /** The listing hit the endpoint's entry cap, so entries are missing. */
  readonly truncated: boolean
}

/** What one directory level is doing right now. */
export type LevelState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly level: DirLevel }
  | { readonly kind: 'failed'; readonly failure: RemoteFailure }

/**
 * One tab's tree: its root, the levels it has asked for, and what is open.
 *
 * Every path here is absolute: the root is the session's working directory as
 * the Host reports it, and a child is the parent joined with the entry name.
 */
export interface FilesTabState {
  /** Absolute path of the workspace root this tree is rooted at. */
  root: string
  /** Level state by absolute directory path; a path absent here was never asked for. */
  levels: Record<string, LevelState>
  /** Expanded absolute directory paths, root included. */
  expanded: string[]
  /** The body's scroll offset in px, so a remounted tree comes back where the reader was. */
  scrollTop: number
}

/** What one file editor is doing with its file right now. */
export type FileEditPhase =
  | { readonly kind: 'reading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'failed'; readonly failure: RemoteFailure }

/** How the last finished save ended, for the toolbar status. */
export type FileSaveState = 'idle' | 'saved' | 'failed'

/**
 * One tab's editor: the file as the disk holds it, the unsaved draft on top
 * of it, and the save state between them.
 *
 * `version` is the opaque equality token every save writes against; `draft`
 * carries the editor document while it differs from the disk text, so a body
 * remount restores it. The state survives across a body's unmounts — that is
 * why it is a declared store and not component state.
 */
export interface FileEditState {
  phase: FileEditPhase
  /** The text as last read from or written to the disk. */
  text: string
  /** The freshness token of `text`; every save's `baseVersion`. */
  version: string
  /** Whether the editor holds unsaved changes. */
  dirty: boolean
  /** The editor document while dirty; absent when it matches `text`. */
  draft: string | undefined
  /** Whether a save is in flight. */
  saving: boolean
  /** How the last finished save ended. */
  saveState: FileSaveState
  /** The settled save failure, for its line. */
  saveFailure: RemoteFailure | undefined
  /** A save was refused because the disk moved on; the draft is intact. */
  conflict: boolean
  /** Whether the editor wraps lines. */
  wrap: boolean
  /** Bumped by every load that should remount the editor surface. */
  loadSeq: number
  /** The navigation revision whose line target has been answered. */
  answered: number
}

/** Every tab's tree, keyed by tab id. */
export interface FilesState {
  byTab: Record<TabId, FilesTabState>
  /** The `file` editor's buckets; the `files` page never seeds one. */
  edits: Record<TabId, FileEditState>
}

/**
 * One tab's tree bucket, which every writer after `start` relies on: the face only
 * dispatches while the record's signal is live, and `forget` runs on its abort.
 * @param state - the draft.
 * @param tabId - the tab being written.
 * @returns the tab's tree.
 */
function bucket(state: FilesState, tabId: TabId): FilesTabState {
  const tree = state.byTab[tabId]
  if (tree === undefined) throw new Error(`ui-sidebar-files: no tree for tab "${tabId}"`)
  return tree
}

/**
 * One tab's editor bucket, which every edit action relies on: the face only
 * dispatches while the record's signal is live, and `editForget` runs on its
 * abort.
 * @param state - the draft.
 * @param tabId - the tab being written.
 * @returns the tab's editor state.
 */
function editBucket(state: FilesState, tabId: TabId): FileEditState {
  const edit = state.edits[tabId]
  if (edit === undefined) throw new Error(`ui-sidebar-files: no editor for tab "${tabId}"`)
  return edit
}

/** A fresh editor bucket for a read that is starting. */
function freshEdit(): FileEditState {
  return {
    phase: { kind: 'reading' },
    text: '',
    version: '',
    dirty: false,
    draft: undefined,
    saving: false,
    saveState: 'idle',
    saveFailure: undefined,
    conflict: false,
    wrap: true,
    loadSeq: 0,
    answered: 0,
  }
}

/** The store's write set; every action names the tab it writes. */
type FilesActions = {
  start: (draft: FilesState, tabId: TabId, root: string) => void
  loading: (draft: FilesState, tabId: TabId, path: string) => void
  loaded: (draft: FilesState, tabId: TabId, path: string, level: DirLevel) => void
  failed: (draft: FilesState, tabId: TabId, path: string, failure: RemoteFailure) => void
  toggled: (draft: FilesState, tabId: TabId, path: string) => void
  scrolled: (draft: FilesState, tabId: TabId, scrollTop: number) => void
  reset: (draft: FilesState, tabId: TabId) => void
  forget: (draft: FilesState, tabId: TabId) => void
  editRead: (draft: FilesState, tabId: TabId) => void
  editLoaded: (draft: FilesState, tabId: TabId, text: string, version: string) => void
  editFailed: (draft: FilesState, tabId: TabId, failure: RemoteFailure) => void
  editDraft: (draft: FilesState, tabId: TabId, text: string) => void
  editSaving: (draft: FilesState, tabId: TabId) => void
  editSaved: (draft: FilesState, tabId: TabId, text: string, version: string) => void
  editSaveFailed: (draft: FilesState, tabId: TabId, failure: RemoteFailure) => void
  editWrap: (draft: FilesState, tabId: TabId, wrap: boolean) => void
  editAnswered: (draft: FilesState, tabId: TabId, revision: number) => void
  editForget: (draft: FilesState, tabId: TabId) => void
}

/** Whether a settled save failure is the disk-hasmoved refusal. */
function isStale(failure: RemoteFailure): boolean {
  return failure.code === 'workspace-file/stale'
}

/**
 * Declare the tree and editor store.
 *
 * A factory rather than a shared handle: the registrations declare it as an
 * exclusive store, so the framework mints one instance per session, shared by
 * the `files` and `file` seats that receive it.
 * @returns the store handle to declare on the registrations.
 */
export function createFilesStore(): EngineStoreHandle<FilesState, FilesActions> {
  return defineStore({
    init: (): FilesState => ({ byTab: {}, edits: {} }),
    actions: {
      /**
       * Seed one tab's tree at its workspace root, with the root expanded.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param root - absolute path of the workspace root.
       */
      start: (d, tabId: TabId, root: string) => {
        d.byTab[tabId] = { root, levels: {}, expanded: [root], scrollTop: 0 }
      },
      /**
       * Mark one directory as being listed.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param path - absolute directory path.
       */
      loading: (d, tabId: TabId, path: string) => {
        bucket(d, tabId).levels[path] = { kind: 'loading' }
      },
      /**
       * Record one directory's contents.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param path - absolute directory path.
       * @param level - the listing to show under it.
       */
      loaded: (d, tabId: TabId, path: string, level: DirLevel) => {
        bucket(d, tabId).levels[path] = { kind: 'ready', level }
      },
      /**
       * Record why one directory could not be listed.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param path - absolute directory path.
       * @param failure - the settled Remote failure.
       */
      failed: (d, tabId: TabId, path: string, failure: RemoteFailure) => {
        bucket(d, tabId).levels[path] = { kind: 'failed', failure }
      },
      /**
       * Open a collapsed directory, or collapse an open one.
       *
       * A collapsed level keeps what it loaded, so reopening it draws at once.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param path - absolute directory path.
       */
      toggled: (d, tabId: TabId, path: string) => {
        const state = bucket(d, tabId)
        const at = state.expanded.indexOf(path)
        if (at >= 0) state.expanded.splice(at, 1)
        else state.expanded.push(path)
      },
      /**
       * Record where one tab's body is scrolled to.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param scrollTop - the body's scroll offset, in px.
       */
      scrolled: (d, tabId: TabId, scrollTop: number) => {
        bucket(d, tabId).scrollTop = scrollTop
      },
      /**
       * Drop every loaded level, keeping what is expanded.
       *
       * This is the reload gesture's first half: the expanded set says which
       * levels to fetch again.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      reset: (d, tabId: TabId) => {
        bucket(d, tabId).levels = {}
      },
      /**
       * Forget one tab's tree, for a tab record that is gone.
       * @param d - draft state.
       * @param tabId - the tab that went away.
       */
      forget: (d, tabId: TabId) => {
        d.byTab = Object.fromEntries(Object.entries(d.byTab).filter(([id]) => id !== tabId))
      },
      /**
       * Start one tab's editor at a fresh read, dropping any draft and conflict.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      editRead: (d, tabId: TabId) => {
        // `loadSeq` survives the reset: it must only ever climb, so a reload
        // after a first load still reads as a new surface to mount.
        const previous = d.edits[tabId]
        d.edits[tabId] = {
          ...freshEdit(),
          // `answered` survives like `loadSeq`: a navigation is answered once
          // per revision, however many times the surface rebuilds.
          loadSeq: previous?.loadSeq ?? 0,
          answered: previous?.answered ?? 0,
        }
      },
      /**
       * Record a whole file as read, becoming the editor's clean content.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param text - the file's whole text.
       * @param version - the freshness token the read reported.
       */
      editLoaded: (d, tabId: TabId, text: string, version: string) => {
        const edit = editBucket(d, tabId)
        edit.phase = { kind: 'ready' }
        edit.text = text
        edit.version = version
        edit.loadSeq += 1
      },
      /**
       * Record why the file could not be read.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      editFailed: (d, tabId: TabId, failure: RemoteFailure) => {
        editBucket(d, tabId).phase = { kind: 'failed', failure }
      },
      /**
       * Record the editor document: the tab is dirty until a save or a load
       * lands, and the draft is what a remount restores.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param text - the editor document.
       */
      editDraft: (d, tabId: TabId, text: string) => {
        const edit = editBucket(d, tabId)
        edit.dirty = true
        edit.draft = text
        edit.saveState = 'idle'
        edit.saveFailure = undefined
      },
      /**
       * Mark one save as in flight.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      editSaving: (d, tabId: TabId) => {
        const edit = editBucket(d, tabId)
        edit.saving = true
        edit.saveState = 'idle'
        edit.saveFailure = undefined
      },
      /**
       * Record a saved file: the written text is the new clean content, and the
       * save's version is what the next save writes against.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param text - the text the save wrote.
       * @param version - the freshness token the save produced.
       */
      editSaved: (d, tabId: TabId, text: string, version: string) => {
        const edit = editBucket(d, tabId)
        edit.saving = false
        edit.saveState = 'saved'
        edit.text = text
        edit.version = version
        edit.dirty = false
        edit.draft = undefined
        edit.conflict = false
      },
      /**
       * Record why a save failed. The stale refusal keeps the draft intact and
       * raises the conflict: the disk holds a different version, and the reader
       * chooses between them.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      editSaveFailed: (d, tabId: TabId, failure: RemoteFailure) => {
        const edit = editBucket(d, tabId)
        edit.saving = false
        edit.saveState = 'failed'
        edit.saveFailure = failure
        edit.conflict = isStale(failure)
      },
      /**
       * Set whether the editor wraps lines.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param wrap - whether lines wrap.
       */
      editWrap: (d, tabId: TabId, wrap: boolean) => {
        editBucket(d, tabId).wrap = wrap
      },
      /**
       * Record the navigation revision whose line target the body landed on,
      * so one revision is answered once however often the effect re-runs.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param revision - the answered navigation revision.
       */
      editAnswered: (d, tabId: TabId, revision: number) => {
        editBucket(d, tabId).answered = revision
      },
      /**
       * Forget one tab's editor, for a tab record that is gone.
       * @param d - draft state.
       * @param tabId - the tab that went away.
       */
      editForget: (d, tabId: TabId) => {
        d.edits = Object.fromEntries(Object.entries(d.edits).filter(([id]) => id !== tabId))
      },
    },
  })
}
