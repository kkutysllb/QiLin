/**
 * The `file` tab's body: the workspace tree in a fixed, collapsible side pane,
 * the open file in a CodeMirror editor.
 *
 * The tree is this package's own (`FileTree.tsx`); a row click opens the file
 * through the owner's `tabActions.openResource`, so it lands on this type and
 * de-duplicates by address — the tab's file never switches in place. The
 * editor's draft and save state live in the package store, so they survive the
 * body's unmounts; the surface itself is the CodeMirror adapter
 * (`file-editor.ts`), mounted for the ready phase and destroyed on reload.
 *
 * The toolbar row carries the dirty dot, preview, save, wrap, and reload; a save the
 * disk refuses as stale raises the conflict banner, whose two actions discard
 * this draft for the disk content or overwrite the disk with it. Reload with
 * unsaved changes asks first, for the same reason.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconBrowseOutline16, IconCheckOutline16, IconPanelLeftOutline16, IconRefreshOutline16,
} from '@qilin/client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@qilin/client-ui-slots'
// The `file` entry of `SidebarRightResourceParamsMap`, which types the line
// navigation read below (the same type-only edge ui-chat declares).
import type {} from '@qilin/client-ui-sidebar-documentpreview/client'
import { fileAddressFor } from '@qilin/util-workspace-path'
import { FileTree } from './FileTree.tsx'
import { fileFailureLine } from './file-failure.ts'
import { mountFileEditor } from './file-editor.ts'
import type { FileEditorHandle } from './file-editor.ts'
import { sessionFileOf } from './file-guard.ts'
import type { FilesInjected } from './face.ts'
import type { FileEditorInjected } from './file-face.ts'
import type { FilePreviewInjected } from './file-preview.ts'
import type {} from './locales.ts'
import type { FileEditState, createFilesStore } from './store.ts'
import css from './FileBody.module.css'

/** The body's composed props: the tab it draws, its store, its faces, and its copy. */
export type FileBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsStore<ReturnType<typeof createFilesStore>>
  & FilesInjected
  & FileEditorInjected
  & FilePreviewInjected
  & PropsLocale<'sidebarFiles'>

/** The status line one editor state deserves, or an empty string for none. */
function statusLine(edit: FileEditState, t: FileBodyProps['t']): string {
  if (edit.saving) return t('file.saving')
  if (edit.saveState === 'saved') return t('file.saved')
  // A stale save is the conflict banner's business; its line would duplicate it.
  if (edit.saveState === 'failed' && !edit.conflict && edit.saveFailure !== undefined) {
    return fileFailureLine(t, edit.saveFailure)
  }
  return ''
}

/** The file editor's body: the tree pane and the open file's editor pane. */
export function FileBody({
  useTabInfo, sessionId, useSessions, useStore, actions, start, toggle, readFile, saveFile, openPreview, t,
}: FileBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const { signal, actions: tabActions } = tab
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  const state = useStore(store => store.byTab[tab.id])
  const edit = useStore(store => store.edits[tab.id])
  // The tab's address is its whole file identity: one file per tab, deduped by
  // address, so it is decoded once per render and never changes.
  const file = sessionFileOf(tab.navigation.address)
  const [treeOpen, setTreeOpen] = useState(true)
  const [confirmReload, setConfirmReload] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<FileEditorHandle | null>(null)
  // The live bucket for callbacks that outlive one render: reads always see
  // the latest.
  const editRef = useRef<FileEditState | undefined>(undefined)

  // One save decision, rebuilt each render: the store bucket it reads through
  // `editRef` is what makes a stale caller (the keymap below) safe.
  const performSave = (force: boolean): void => {
    // Only the ready-phase toolbar and the mounted surface's keymap get here;
    // `saving` is the double-save brake — the keymap stays live in flight.
    const current = editRef.current
    if (current === undefined || current.saving || current.phase.kind !== 'ready') return
    saveFile(tab.id, file, current.draft ?? current.text, {
      baseVersion: current.version,
      force,
    }, signal)
  }
  // The keymap captures one closure for the view's lifetime; this ref is what
  // it actually calls, and the effect below reassigns it every render.
  const saveRef = useRef(performSave)
  useEffect(() => {
    editRef.current = edit
    saveRef.current = performSave
  })

  useEffect(() => {
    // A bucket gone because the record aborted must not be re-seeded by a
    // component that has not unmounted yet.
    if (state !== undefined || cwd === undefined || signal.aborted) return
    start(tab.id, cwd, signal)
  }, [state, cwd, tab.id, signal, start])

  useEffect(() => {
    // The tab's whole reason to exist: its file, read once the record is live.
    // A bucket gone because the record aborted is not re-read by a body that
    // has not unmounted yet, and a session without a workspace reads nothing.
    if (edit !== undefined || cwd === undefined || signal.aborted) return
    readFile(tab.id, file, signal)
  }, [edit, cwd, tab.id, file, signal, readFile])

  // The editor surface exists for the ready phase; `loadSeq` remounts it for
  // a reload while every other commit (a draft, a save) leaves it alone.
  const ready = edit !== undefined && edit.phase.kind === 'ready'
  useEffect(() => {
    if (!ready) return undefined
    // The ready render updated editRef (the effect above runs first) and
    // mounted the host; the surface exists for exactly that phase.
    const current = editRef.current
    const host = hostRef.current
    if (current === undefined || host === null) return undefined
    const handle = mountFileEditor(host, {
      text: current.draft ?? current.text,
      path: file.path,
      wrap: current.wrap,
      onDocumentChange: (text) => { actions.editDraft(tab.id, text) },
      onSave: () => { saveRef.current(false) },
    })
    editorRef.current = handle
    return () => {
      handle.destroy()
      editorRef.current = null
    }
  }, [ready, edit?.loadSeq, file.path, tab.id, actions])

  useEffect(() => {
    // Runs on every commit; the surface exists only while ready, and the
    // bucket it reads is the one that render saw.
    const current = editRef.current
    if (current !== undefined) editorRef.current?.setWrap(current.wrap)
  }, [edit?.wrap, ready])

  // A line reference (a tool card's `openResource` params) lands once per
  // navigation revision: selected and scrolled to, clamped into the file. The
  // answered revision is remembered in the bucket, so a remount restores the
  // reader's place instead of re-jumping, and a line arriving before the
  // surface exists is answered as soon as the surface mounts.
  const line = tab.navigation.params !== undefined && 'line' in tab.navigation.params
    ? tab.navigation.params.line
    : undefined
  useEffect(() => {
    if (line === undefined) return
    if (edit !== undefined && edit.answered === tab.navigation.revision) return
    const surface = editorRef.current
    if (surface === null) return
    const doc = surface.view.state.doc
    const target = doc.line(Math.min(Math.max(1, Math.trunc(line)), doc.lines))
    surface.view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true })
    actions.editAnswered(tab.id, tab.navigation.revision)
  }, [line, tab.navigation.revision, ready, edit?.loadSeq, edit, tab.id, actions])

  if (cwd === undefined) {
    return (
      <div className={css.status} data-file-state="no-workspace">
        <p className={css.statusLine}>{t('noWorkspace')}</p>
      </div>
    )
  }
  if (state === undefined || edit === undefined) {
    return <div className={css.root} data-file-state="loading" />
  }

  const performReload = (): void => {
    setConfirmReload(false)
    readFile(tab.id, file, signal)
  }
  const reload = (): void => {
    // A reload drops the draft: with unsaved changes, ask first.
    if (edit.dirty) setConfirmReload(true)
    else performReload()
  }
  const status = statusLine(edit, t)
  const { root, levels } = state
  return (
    <div className={css.root} data-file-state={edit.phase.kind} data-file-conflict={edit.conflict || undefined}>
      <div className={css.toolbar}>
        <button
          type="button"
          className={clsx(css.tool, treeOpen && css.toolActive)}
          aria-label={t('file.treeToggle')}
          title={t('file.treeToggle')}
          aria-pressed={treeOpen}
          data-file-tree-toggle
          onClick={() => { setTreeOpen(open => !open) }}
        >
          <IconPanelLeftOutline16 />
        </button>
        <div className={css.path} title={file.path} data-file-path>{file.path}</div>
        {edit.dirty && <span className={css.dirtyDot} title={t('file.unsaved')} data-file-dirty />}
        <span className={css.spring} />
        {status !== '' && <span className={clsx(css.statusText, edit.saveState === 'failed' && css.statusError)} data-file-status>{status}</span>}
        <button
          type="button"
          className={css.tool}
          aria-label={t('file.preview')}
          title={t('file.preview')}
          data-file-preview
          disabled={edit.saving}
          onClick={() => { openPreview(sessionId, tab.navigation.address) }}
        >
          <IconBrowseOutline16 />
        </button>
        <button
          type="button"
          className={clsx(css.tool, edit.wrap && css.toolActive)}
          aria-label={t('file.wrap')}
          title={t('file.wrap')}
          aria-pressed={edit.wrap}
          data-file-wrap
          disabled={edit.saving}
          onClick={() => { actions.editWrap(tab.id, !edit.wrap) }}
        >
          <span className={css.wrapLabel}>{t('file.wrap')}</span>
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('file.reload')}
          title={t('file.reload')}
          data-file-reload
          disabled={edit.saving}
          onClick={reload}
        >
          <IconRefreshOutline16 />
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('file.save')}
          title={t('file.save')}
          data-file-save
          disabled={edit.saving}
          onClick={() => { performSave(false) }}
        >
          <IconCheckOutline16 />
        </button>
      </div>
      {confirmReload && (
        <div className={css.banner} data-file-confirm>
          <span className={css.bannerText}>{t('file.reloadDirty')}</span>
          <button type="button" className={css.bannerButton} data-file-confirm-reload onClick={performReload}>
            {t('file.reloadDirty.confirm')}
          </button>
          <button type="button" className={css.bannerButton} data-file-confirm-cancel onClick={() => { setConfirmReload(false) }}>
            {t('file.reloadDirty.cancel')}
          </button>
        </div>
      )}
      {edit.conflict && (
        <div className={css.banner} data-file-conflict-banner>
          <span className={css.bannerText}>{t('file.conflict')}</span>
          <button
            type="button"
            className={css.bannerButton}
            data-file-conflict-overwrite
            disabled={edit.saving}
            onClick={() => { performSave(true) }}
          >
            {t('file.conflict.overwrite')}
          </button>
          <button
            type="button"
            className={css.bannerButton}
            data-file-conflict-reload
            disabled={edit.saving}
            onClick={performReload}
          >
            {t('file.conflict.reload')}
          </button>
        </div>
      )}
      <div className={css.body}>
        {treeOpen && (
          <div className={css.treePane} data-file-tree-open>
            <div className={css.treeScroll}>
              <FileTree
                state={state}
                onToggle={(path) => { toggle(tab.id, path, levels[path] !== undefined, signal) }}
                // Every row is under the tree's root, so its address is
                // session-relative; the open lands on this type and dedupes.
                onOpen={(path) => { tabActions.openResource(fileAddressFor(sessionId, root, path)) }}
                t={t}
              />
            </div>
          </div>
        )}
        <div className={css.editorPane}>
          {edit.phase.kind === 'reading' && (
            <p className={css.placeholder} data-file-row="loading">{t('loading')}</p>
          )}
          {edit.phase.kind === 'failed' && (
            <p className={css.placeholder} data-file-row="failed" data-file-code={edit.phase.failure.code}>
              {fileFailureLine(t, edit.phase.failure)}
            </p>
          )}
          <div ref={hostRef} className={css.host} data-file-host={ready || undefined} />
        </div>
      </div>
    </div>
  )
}
