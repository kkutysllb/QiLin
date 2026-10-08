/**
 * The tree's row mutations: creating a file or a directory, renaming one entry,
 * and deleting one — plus how the tabs already open on a moved or removed path
 * are reconciled with it.
 *
 * The three gestures share one shape: validate the typed name, call one Remote
 * on the `workspaceFiles` namespace, and on success re-list the directory that
 * held the entry, so the row is read again rather than guessed at. An entry a
 * move or a removal touched is also reconciled with the open tabs: a tab whose
 * address names the old path is retargeted to the new one, and a tab whose path
 * is gone is closed, because its next read or save would fail against a path
 * nothing holds.
 *
 * Everything here is either a pure path or failure decision — directly testable
 * on its own — or the thin binding of one Remote to the shape the tree's face
 * calls.
 * @module
 */
import type { ClientRemote, RemoteFailure, RemoteResult } from '@qilin-agent/api-remotes/client'
import type { TabId } from '@qilin-agent/client-ui-dockkit'
import type { TranslateNS } from '@qilin-agent/client-locale/client'
import type { SessionId } from '@qilin-agent/session/types'
import { fileAddressFor, parseFileAddress, pathPartsOf, resolveWorkspacePath } from '@qilin-agent/util-workspace-path'

/** The two entry kinds a create gesture makes. */
export type EntryKind = 'file' | 'directory'

/**
 * The one name a typed text may become, or `undefined` when it may not.
 *
 * A name is a single path segment: surrounding spaces are dropped, and a blank
 * text, a dot segment, or anything carrying a separator is refused. The caller
 * keeps its box open on `undefined` so nothing is written under a name the
 * reader did not mean.
 * @param text - the box's text, exactly as typed.
 * @returns the trimmed name, or `undefined` when it cannot be one.
 */
export function normalizedEntryName(text: string): string | undefined {
  const name = text.trim()
  if (name === '' || name === '.' || name === '..') return undefined
  if (name.includes('/') || name.includes('\\')) return undefined
  return name
}

/**
 * The directory holding one path, in that path's own spelling.
 * @param path - an absolute path.
 * @returns the parent directory; its root (`/`, `C:\`) when the path is one
 * level below a root, and the empty string for a path with no separator.
 */
export function parentDirectoryOf(path: string): string {
  const { directory } = pathPartsOf(path)
  const head = directory.replace(/[/\\]+$/, '')
  return head === '' ? directory.slice(0, 1) : head
}

/**
 * The absolute path of one named entry inside a directory.
 *
 * The child joins with `/` whatever the parent's own separators: the Host
 * resolves mixed separators, and the tree only needs one stable key.
 * @param directory - absolute path of the directory the entry sits in.
 * @param name - the entry's basename.
 * @returns the entry's absolute path.
 */
export function joinEntryPath(directory: string, name: string): string {
  return `${directory.replace(/[/\\]+$/, '')}/${name}`
}

/**
 * Whether one path is a target itself or lives under it.
 *
 * Both sides are compared with `/` separators and without a trailing separator,
 * so the same directory spelled with either separator, with or without its
 * final slash, matches.
 * @param candidate - the path to classify.
 * @param target - the entry a move or a removal touched.
 * @returns whether the candidate is the target or one of its descendants.
 */
export function pathAtOrUnder(candidate: string, target: string): boolean {
  const path = candidate.replace(/\\/g, '/').replace(/\/+$/, '')
  const root = target.replace(/\\/g, '/').replace(/\/+$/, '')
  if (root === '') return path === ''
  return path === root || path.startsWith(`${root}/`)
}

/**
 * Say why a row mutation failed, in terms of the entry rather than of the
 * transport. Codes this tree does not name — the filesystem's own `FS_*`
 * pass-throughs among them — reach the reader as the carrier's message.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show in the tree's mutation strip.
 */
export function mutationFailureLine(t: TranslateNS<'sidebarFiles'>, failure: RemoteFailure): string {
  switch (failure.code) {
    case 'workspace-file/not-found': return t('error.gone')
    case 'workspace-file/exists': return t('error.exists')
    case 'workspace-file/not-empty': return t('error.notEmpty')
    case 'workspace-file/not-regular-file': return t('error.notRegular')
    case 'workspace-file/outside-workspace': return t('error.outsideWorkspace')
    // Carrier and unclassified host failures reach the reader as themselves:
    // this tree knows nothing useful to add to a transport-level message.
    default: return t('error.mutationFailed', { message: failure.message })
  }
}

/**
 * The `workspaceFiles` calls one row mutation is made of, as the tree's face
 * calls them. Each resolves with the endpoint's own result; the caller only
 * branches on `ok`.
 */
export interface WorkspaceFileMutations {
  /** Write one new, empty file: a `write` with no `baseVersion` is unconditional. */
  readonly createFile: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<unknown>>
  /** Create one directory; its parent must already exist. */
  readonly createDirectory: (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<unknown>>
  /** Move or rename one entry; an existing destination is refused. */
  readonly move: (sessionId: SessionId, from: string, to: string, signal: AbortSignal) => Promise<RemoteResult<unknown>>
  /** Delete one file, or one directory whole with `recursive`. */
  readonly remove: (sessionId: SessionId, path: string, recursive: boolean, signal: AbortSignal) => Promise<RemoteResult<unknown>>
}

/**
 * The slice of the Client Remote face this package mutates entries through,
 * exactly as the Host's generated client declares it.
 */
export type WorkspaceFilesMutationRemote = {
  readonly workspaceFiles: Pick<ClientRemote['workspaceFiles'], 'write' | 'createDirectory' | 'move' | 'delete'>
}

/**
 * Bind the four row mutations to one Remote face, keeping each call's shape.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace.
 * @returns the mutations the tree's face performs.
 */
export function createMutations(remote: WorkspaceFilesMutationRemote): WorkspaceFileMutations {
  return {
    createFile: (sessionId, path, signal) => remote.workspaceFiles.write(sessionId, path, '', {}, signal),
    createDirectory: (sessionId, path, signal) => remote.workspaceFiles.createDirectory(sessionId, path, signal),
    move: (sessionId, from, to, signal) => remote.workspaceFiles.move(sessionId, from, to, signal),
    // The wire operation is `delete`: `remove` is reserved on the Host's
    // namespace service, which refuses a mounted method that shadows it.
    remove: (sessionId, path, recursive, signal) => remote.workspaceFiles.delete(sessionId, path, recursive, signal),
  }
}

/** One open tab, as far as a path mutation cares: the address it was opened at. */
export interface OpenTabRef {
  /** The tab's own id, the handle a close or a replacement names. */
  readonly id: TabId
  /** The resource address the tab was opened at. */
  readonly contentId: string
}

/**
 * The Sidebar slice open tabs are reconciled through.
 *
 * Structural rather than the controller's own type: this package needs three
 * calls, and the injected service is a superset of them.
 */
export interface SidebarTabReconcile {
  /** The committed tabs of one Session, or an empty list before adoption. */
  readonly tabsIn: (sessionId: SessionId) => readonly OpenTabRef[]
  /** Open a resource in one Session, optionally in the replaced tab's own place. */
  readonly openResourceIn: (
    sessionId: SessionId,
    address: string,
    options: { readonly replaceTab: TabId },
  ) => void
  /** Close one tab of one Session. */
  readonly closeIn: (sessionId: SessionId, tabId: TabId) => void
}

/** How one touched path is settled against the tabs already open on it. */
export interface TabReconcile {
  /**
   * Retarget every tab open at or under a path that moved.
   * @param sessionId - the Session whose tabs are read.
   * @param root - the Session's workspace root, which the addresses are relative to.
   * @param from - the entry's path before the move.
   * @param to - the entry's path after it.
   */
  readonly moved: (sessionId: SessionId, root: string, from: string, to: string) => void
  /**
   * Close every tab open at or under a path that is gone.
   * @param sessionId - the Session whose tabs are read.
   * @param root - the Session's workspace root, which the addresses are relative to.
   * @param path - the removed entry's path.
   */
  readonly removed: (sessionId: SessionId, root: string, path: string) => void
}

/**
 * Bind the tab reconciliation to one Sidebar controller.
 * @param sidebar - the right Sidebar's tab paths.
 * @returns the reconciliation a mutation performs on success.
 */
export function createTabReconcile(sidebar: SidebarTabReconcile): TabReconcile {
  /**
   * The absolute path one tab addresses, or `undefined` for a tab this
   * reconciliation has no business touching: another Session's, a non-file
   * address (a page), or an absolute file address with no Session at all.
   */
  const pathOf = (sessionId: SessionId, root: string, tab: OpenTabRef): string | undefined => {
    const parsed = parseFileAddress(tab.contentId)
    if (parsed === undefined || parsed.scope !== 'session' || parsed.sessionId !== sessionId) return undefined
    const resolved = resolveWorkspacePath(root, parsed.path)
    return resolved.replace(/[/\\]+$/, '') || resolved
  }
  return {
    moved(sessionId, root, from, to) {
      // The layout is read once: a replacement that reveals an already-open
      // destination closes the tab it replaced, which the captured list still
      // names with its own id.
      for (const tab of sidebar.tabsIn(sessionId)) {
        const path = pathOf(sessionId, root, tab)
        if (path === undefined || !pathAtOrUnder(path, from)) continue
        sidebar.openResourceIn(
          sessionId,
          fileAddressFor(sessionId, root, `${to}${path.slice(from.length)}`),
          { replaceTab: tab.id },
        )
      }
    },
    removed(sessionId, root, path) {
      for (const tab of sidebar.tabsIn(sessionId)) {
        const open = pathOf(sessionId, root, tab)
        if (open !== undefined && pathAtOrUnder(open, path)) sidebar.closeIn(sessionId, tab.id)
      }
    },
  }
}
