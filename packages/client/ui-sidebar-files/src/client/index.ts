/**
 * Browser half: register this package's two right-Sidebar tab types.
 *
 * The `files` page — the workspace tree as an empty-state explorer — and the
 * `file` editor workbench, which claims session file addresses with editable
 * extensions. Each type goes through the public two-stage path: the type into
 * `ctx.sidebarRightTabs`, its body into the keyed `sidebar.right.pane.tab`
 * seat and its chip title into the keyed `sidebar.right.pane.tab.title` seat,
 * all under the type's own `id`.
 *
 * The file split is this package's layering: what each type IS
 * (`definition.tsx`, `file-definition.ts`), what it keeps (`store.ts`), how it
 * lists and saves (`face.ts`, `file-face.ts`, `file-pages.ts`), how it hands a
 * file to the preview viewer (`file-preview.ts`), what it draws
 * (`FilesBody.tsx`, `FilesTitle.tsx`, `FileBody.tsx`, `FileTitle.tsx`,
 * `FileTree.tsx`), the editor surface behind the adapter (`file-editor.ts`),
 * what it says (`locales.ts`), and this module, which only wires them
 * together.
 */
import type { Context as ClientContext } from '@qilin/kylin'
import type { BoundActions } from '@qilin/client-store'
import type { SessionId } from '@qilin/session/types'
import type { ClientRemote } from '@qilin/api-remotes/client'
import type {} from '@qilin/api-remotes/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-ui-session/client'
import type {} from '@qilin/client-ui-sidebar-right/client'
import { FILES_ID, filesDefinition } from './definition.tsx'
import { FILE_ID, fileDefinition } from './file-definition.ts'
import { createList, filesFace } from './face.ts'
import { fileEditFace } from './file-face.ts'
import { filePreviewFace } from './file-preview.ts'
import type { FilesInjected } from './face.ts'
import type { FileEditorInjected, WriteWorkspaceFile } from './file-face.ts'
import type { FilePreviewInjected } from './file-preview.ts'
import { createReadWhole } from './file-pages.ts'
import type { ReadWorkspaceFilePage } from './file-pages.ts'
import { FilesBody } from './FilesBody.tsx'
import { FilesTitle } from './FilesTitle.tsx'
import { FileBody } from './FileBody.tsx'
import { FileTitle } from './FileTitle.tsx'
import { en, zh } from './locales.ts'
import { createFilesStore } from './store.ts'

export type { SidebarFilesKey } from './locales.ts'
export type { DirLevel, FileEditState, FilesState, FilesTabState, LevelState } from './store.ts'
export type { FilesInjected, ListWorkspaceDirectory, WorkspaceFilesListRemote } from './face.ts'
export type { FilePreviewInjected } from './file-preview.ts'
export type { FilesBodyProps } from './FilesBody.tsx'

/** This package's copy namespace. */
const NS = 'sidebarFiles'

/**
 * The slice of the Client Remote face this package calls: the `workspaceFiles`
 * namespace's `write`, exactly as the Host's generated client declares it.
 */
export interface WorkspaceFilesWriteRemote {
  readonly workspaceFiles: {
    /** Save one complete UTF-8 text file. */
    write: WriteWorkspaceFile
  }
}

/**
 * Bind the write to one Remote face, keeping the call's shape.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace.
 * @returns the write the editor's face performs.
 */
export function createWriteFile(remote: WorkspaceFilesWriteRemote): WriteWorkspaceFile {
  return (sessionId, path, text, request, signal) =>
    remote.workspaceFiles.write(sessionId, path, text, request, signal)
}

/**
 * Bind the paged read to one Remote face. The page length is the Host's
 * configured cap, so no `limit` travels; the walk starts at line 1.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace.
 * @returns the read the whole-file walk performs.
 */
export function createReadPage(remote: {
  readonly workspaceFiles: Pick<ClientRemote['workspaceFiles'], 'read'>
}): ReadWorkspaceFilePage {
  return (sessionId, path, offset, signal) => remote.workspaceFiles.read(sessionId, path, { offset }, signal)
}

/**
 * Required browser services: the tab registry, the keyed seat, the Sidebar
 * controller (the preview open), the Remote carrier and its namespace, and copy.
 */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'remote', 'remote.workspaceFiles']

/**
 * Client plugin body: register both types, their dictionaries, and each body
 * and chip title under its own id.
 * @param ctx - client root context carrying the registry, the slots, and the Remote face.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register(filesDefinition(t)), 'ui-sidebar-files: files type')
  ctx.effect(() => ctx.sidebarRightTabs.register(fileDefinition(t)), 'ui-sidebar-files: file type')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-files: dictionaries')

  // One store instance per session, shared by both seats: the editor's tree
  // pane and the files page keep their buckets apart by tab id.
  const store = createFilesStore()
  const treeFace = filesFace(createList(ctx.remote))
  const editFace = fileEditFace(
    createReadWhole(createReadPage(ctx.remote)),
    createWriteFile(ctx.remote),
  )
  const previewFace = filePreviewFace(ctx.sidebarRight)
  const workbenchFace = (sessionId: SessionId, actions: BoundActions<ReturnType<typeof createFilesStore>>):
    FilesInjected & FileEditorInjected & FilePreviewInjected => ({
    ...treeFace(sessionId, actions),
    ...editFace(sessionId, actions),
    ...previewFace(),
  })
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: FILES_ID, locale: NS, store, inject: treeFace },
    FilesBody,
  )), 'ui-sidebar-files: files tab body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: FILES_ID },
    FilesTitle,
  )), 'ui-sidebar-files: files tab title')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: FILE_ID, locale: NS, store, inject: workbenchFace },
    FileBody,
  )), 'ui-sidebar-files: file tab body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: FILE_ID },
    FileTitle,
  )), 'ui-sidebar-files: file tab title')
}
