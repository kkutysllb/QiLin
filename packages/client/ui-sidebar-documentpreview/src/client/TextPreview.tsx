/**
 * The text preview's body: a file's content, or the reason it is not showing.
 *
 * Two sources meet here. The standard `useResource` hook gives the file's
 * metadata — its version — and this type's
 * own store holds the content it read through its face. A Host-reported change is
 * announced, not applied: reloading under a reader would lose their place, so
 * the bar waits for a click. A failed metadata frame — the file gone, its
 * workspace unknown — takes the same bar's place over the pages already loaded,
 * with the same reload. The type's controls — the editor open for a file the
 * editor type takes, viewer choice, wrap, and reload — sit at the end of the
 * path row, and the seats other plugins contribute to act on the file through
 * its Host path; the Sidebar's strip carries none of them.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'
import clsx from 'clsx'
import type { ObservableSnapshot } from '@qilin-agent/client-store'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@qilin-agent/client-ui-slots'
import {
  FileTypeIcon, IconEditOutline16, IconPauseOutline16, IconPlayOutline16,
  IconRefreshOutline16, Menu, Tooltip, classifyFileType,
} from '@qilin-agent/client-ui-primitives'
import { acceptsPath, parseFileAddress, pathPartsOf } from '@qilin-agent/util-workspace-path'
import type { TextInjected } from './face.ts'
import { failureLine } from './failure-line.ts'
import { IconNowrapFill16, IconWrapFill16 } from './icons.tsx'
import { LoadingIndicator } from './LoadingIndicator.tsx'
import { hostFileOf } from './rpc.ts'
import type { TextStore } from './store.ts'
import type { DocumentContent } from './document/contract.ts'
import { binaryDocumentPath, matchingDocumentPreviews } from './document/registry.ts'
import type { DocumentPreviewDefinition } from './document/registry.ts'
import { unviewableBinaryPath } from './document/unviewable.ts'
import { PLAIN_BODY_ID } from './text/index.ts'
import { loadedPages, lastLineLoaded, scrollToLine } from './text/lines.ts'
import { buildSelectionInsert, linesOfSelection } from './selection-payload.ts'
import { useSelectionPopup } from './selection-popup.ts'
import css from './TextPreview.module.css'

export { linesOf, loadedPages, lastLineLoaded, scrollToLine } from './text/lines.ts'
export type { LoadedPage } from './text/lines.ts'

/** Keep the path fade in sync with whether its full text fits the header row. */
function usePathClipped(
  box: RefObject<HTMLDivElement | null>,
  text: RefObject<HTMLSpanElement | null>,
  path: string,
  shown: boolean,
): void {
  useLayoutEffect(() => {
    const outer = box.current
    const inner = text.current
    if (outer === null || inner === null) return undefined
    const apply = (): void => {
      if (inner.offsetWidth > outer.clientWidth) outer.dataset.textpreviewPathClipped = ''
      else delete outer.dataset.textpreviewPathClipped
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(outer)
    observer.observe(inner)
    return () => { observer.disconnect() }
  }, [box, text, path, shown])
}

/** Private registration inputs; the framework binds the registry source to useDocumentPreviews. */
export interface TextPreviewInjected extends TextInjected {
  readonly hooks: { readonly documentPreviews: ObservableSnapshot<readonly DocumentPreviewDefinition[]> }
  /**
   * Append one viewer selection to this tab's Session composer draft.
   * @param text - the fenced selection block.
   * @returns whether the Session's input applied it.
   */
  readonly insertSelection: (text: string) => boolean
}

/** The body's composed props: the tab, its navigation, the shared store and face, and copy. */
export type TextPreviewProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsRenderSlots<
    | 'sidebar.right.tab.document'
    | 'sidebar.right.tab.document.action'
    | 'sidebar.right.tab.document.actions'
    | 'sidebar.right.tab.document.unpreviewable'
  >
  & PropsStore<TextStore>
  & InjectFace<TextPreviewInjected>
  & PropsLocale<'sidebarDocumentPreview'>

/**
 * The text type's body, registered under `sidebar.right.pane.tab` as `text`.
 * @param props - composed slot props.
 * @returns the content read so far with its controls, or a progress line.
 */
export function TextPreview({
  useTabInfo, useResource, useStore, actions, loadPage, reloadPages,
  loadAll, reloadAll, prepareRenderer, useDocumentPreviews, renderSlot, t,
  addResource, setResources, insertSelection,
}: TextPreviewProps): ReactNode {
  const { tab } = useTabInfo()
  const { navigation, signal, actions: tabActions } = tab
  const meta = useResource<'file'>(tab.contentId)
  const canRead = meta.status !== 'none'
  const file = useMemo(() => hostFileOf(tab.contentId), [tab.contentId])
  // The editor open is offered exactly where the editor type could take the
  // address: a Session-scoped path whose extension the shared editable set
  // carries. Anything else has no editor to open, so the control is absent.
  const editable = parseFileAddress(tab.contentId)?.scope === 'session' && acceptsPath(file.path)
  const state = useStore(s => s.byTab[tab.id])
  const definitions = useDocumentPreviews(value => value)
  const unviewable = useMemo(() => unviewableBinaryPath(file.path), [file.path])
  const candidates = useMemo(() => {
    const matched = matchingDocumentPreviews(definitions, file.path)
    if (matched.length > 0 && binaryDocumentPath(definitions, file.path)) return matched
    if (matched.length === 0 && unviewable) return matched
    const fallback = definitions.find(definition => definition.id === PLAIN_BODY_ID)
    return fallback === undefined ? matched : [...matched, fallback]
  }, [definitions, file.path, unviewable])
  const selected = candidates.find(candidate => candidate.id === state?.rendererId) ?? candidates[0]
  const mode = selected?.loading
  const contentRendererId = mode === 'renderer' ? selected?.id : undefined
  const current = (state?.mode ?? 'text-pages') === mode && state?.contentRendererId === contentRendererId ? state : undefined
  const add = useCallback((address: string) => {
    addResource(tab.id, address, signal)
  }, [addResource, tab.id, signal])
  const set = useCallback((addresses: readonly string[]) => {
    setResources(tab.id, [tab.contentId, ...addresses], signal)
  }, [setResources, tab.id, tab.contentId, signal])
  useEffect(() => {
    set([])
  }, [set, selected?.id])
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const scrollportRef = useRef<HTMLElement | null>(null)
  const storedScrollTopRef = useRef(0)
  const pathRef = useRef<HTMLDivElement | null>(null)
  const pathTextRef = useRef<HTMLSpanElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const absolutePath = meta.value?.absolutePath ?? current?.complete?.absolutePath
  const displayPath = absolutePath ?? file.path
  // Contributions that hand the file to the Host wait for its Host path.
  const fileOwner = absolutePath === undefined ? undefined : { absolutePath }
  usePathClipped(pathRef, pathTextRef, displayPath, state !== undefined)
  // Every tab of this type is a `file` resource address, so its params are the
  // `file` type's; the union is narrowed on the one field read, not validated.
  const line = navigation.params !== undefined && 'line' in navigation.params ? navigation.params.line : undefined
  const pages = current?.pages
  const loaded = useMemo(() => loadedPages(pages ?? {}), [pages])
  const loadedThrough = lastLineLoaded(loaded)
  const hasContent = mode === 'renderer' ? current?.version !== undefined : loaded.length > 0 || current?.complete !== undefined
  storedScrollTopRef.current = state?.scrollTop ?? 0
  const bindBody = useCallback((body: HTMLDivElement | null): void => {
    const previous = bodyRef.current
    bodyRef.current = body
    if (scrollportRef.current === null || scrollportRef.current === previous) scrollportRef.current = body
  }, [])
  const bindScrollport = useCallback((scrollport: HTMLElement | null): void => {
    const next = scrollport ?? bodyRef.current
    scrollportRef.current = next
    if (next !== null) next.scrollTop = storedScrollTopRef.current
  }, [])

  // First mount reads the first page; a body coming back to a tab with content
  // reads nothing, because the store outlives the body.
  const started = current !== undefined
  useEffect(() => {
    if (started || !canRead || mode === undefined || selected === undefined) return
    if (mode === 'text-pages') loadPage(tab.id, file, 1, signal, meta.value?.version)
    else if (mode === 'bytes-complete') loadAll(tab.id, file, signal, meta.value?.version)
    else prepareRenderer(tab.id, signal, selected.id, meta.value?.version)
  }, [started, tab.id, file, signal, loadPage, loadAll, prepareRenderer, canRead, mode, selected, meta.value?.version])

  // Come back where the reader was once there is content to scroll: on a remount,
  // after a reload rebuilt the content, or after the selected renderer changed.
  // Scroll writes preserve both identities, so they never re-land.
  useEffect(() => {
    const body = scrollportRef.current
    if (hasContent && body !== null && state !== undefined) body.scrollTop = state.scrollTop
  }, [hasContent, selected?.id])

  // Answer a navigation once: a line the pages do not reach yet loads the next
  // page (again, until the pages cover it or the file ends); a line they hold
  // is scrolled to and marked. The store remembers the answer, so a remount
  // restores the reader's place instead.
  useEffect(() => {
    const body = scrollportRef.current
    if (current === undefined || body === null || current.revision === navigation.revision) return
    if (line === undefined || mode !== 'text-pages') {
      actions.navigated(tab.id, navigation.revision)
      return
    }
    if (line > loadedThrough && !current.eof) {
      if (!current.loading && current.failure === undefined && canRead) {
        loadPage(tab.id, file, loadedThrough + 1, signal, meta.value?.version)
      }
      return
    }
    const landed = scrollToLine(body, line)
    if (!landed && line <= loadedThrough) return
    actions.navigated(tab.id, navigation.revision)
    // Recorded here as well as by the scroll event, so the store holds the
    // landing before any later navigation reads it.
    actions.scrolled(tab.id, body.scrollTop)
  }, [
    navigation.revision, line, loadedThrough, current?.eof, current?.loading, current?.failure, started,
    selected?.id, mode, file, canRead, meta.value?.version,
  ])

  const rendererReload = useCallback((): void => {
    if (canRead && selected !== undefined) prepareRenderer(tab.id, signal, selected.id, meta.value?.version, true)
  }, [canRead, prepareRenderer, tab.id, signal, selected?.id, meta.value?.version])
  const observedVersion = meta.value?.version
  const changed = (current?.version !== undefined && observedVersion !== undefined
    && observedVersion !== current.version && observedVersion !== current.observedVersion)
    || state?.resourcesDirty === true
  const reload = useCallback((): void => {
    if (!canRead) return
    if (mode === 'text-pages') reloadPages(tab.id, file, signal, observedVersion)
    else if (mode === 'bytes-complete') reloadAll(tab.id, file, signal, observedVersion)
    else rendererReload()
  }, [canRead, mode, reloadPages, reloadAll, rendererReload, tab.id, file, signal, observedVersion])
  useEffect(() => {
    if (state?.autoRefresh && changed && current !== undefined && !current.loading && meta.status === 'live') reload()
  }, [state?.autoRefresh, changed, current?.loading, meta.status, reload])
  const content = useMemo((): DocumentContent | undefined => {
    if (mode === 'renderer') {
      if (current === undefined) return undefined
      const revision = current.loadRevision
      return { kind: 'renderer', revision, reload: rendererReload,
        failed: () => { actions.rendererFailed(tab.id, revision) },
        loaded: (version) => { actions.rendered(tab.id, revision, version) } }
    }
    if (mode === 'bytes-complete') {
      return current?.complete === undefined ? undefined : {
        kind: 'bytes', data: current.complete.data,
      }
    }
    if (current === undefined || loaded.length === 0) return undefined
    return { kind: 'text', pages: loaded, text: loaded.filter(page => page.lines > 0).map(page => page.text).join('\n'), eof: current.eof }
  }, [mode, loaded, current?.complete, current?.eof, current?.loadRevision, rendererReload, actions, tab.id])

  // The "add selection to conversation" button. Only a text body has a source
  // to reverse-search for line numbers; the byte and whole-file renderers
  // (PDF, images, Office) show documents whose text is not the file's own.
  const source = content?.kind === 'text' ? content.text : undefined
  const selectionPopup = useSelectionPopup({
    onCommit: (insert) => { insertSelection(insert) },
    getSurface: () => bodyRef.current,
  })
  const showSelection = (): void => {
    const selection = window.getSelection()
    const surface = bodyRef.current
    if (selection === null || selection.isCollapsed || surface === null || source === undefined) {
      selectionPopup.hide()
      return
    }
    const { anchorNode, focusNode } = selection
    if (anchorNode === null || focusNode === null
      || !surface.contains(anchorNode) || !surface.contains(focusNode)) {
      selectionPopup.hide()
      return
    }
    const text = selection.toString()
    if (text.trim() === '') {
      selectionPopup.hide()
      return
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    selectionPopup.show(
      buildSelectionInsert(file.path, linesOfSelection(source, text) ?? undefined, text),
      rect.left + rect.width / 2,
      rect.top,
    )
  }

  // A known binary suffix with no matching renderer never reads: no plain-text
  // fallback, no viewer control, only the path and the unsupported line.
  if (selected === undefined && unviewable) {
    const { directory: unsupportedDirectory, name: unsupportedName } = pathPartsOf(displayPath)
    return (
      <div className={css.preview} data-textpreview-state="unsupported" data-textpreview-url={tab.contentId}>
        <div className={css.header}>
          <div className={css.path} title={displayPath} data-textpreview-path>
            <span className={css.pathText}>
              {unsupportedDirectory !== '' && <span className={css.pathDirectory}>{unsupportedDirectory}</span>}
              <span className={css.pathName}>{unsupportedName}</span>
            </span>
          </div>
          {fileOwner !== undefined && renderSlot('sidebar.right.tab.document.actions', fileOwner)}
        </div>
        <div className={css.body} data-textpreview-body>
          <div className={css.empty} data-textpreview-unsupported>
            <FileTypeIcon kind={classifyFileType(unsupportedName)} size={36} className={css.emptyIcon} />
            <p className={css.emptyLine}>{t('unsupportedFile')}</p>
            {fileOwner !== undefined && renderSlot('sidebar.right.tab.document.unpreviewable', fileOwner)}
          </div>
        </div>
      </div>
    )
  }
  if (state === undefined || selected === undefined) {
    return (
      <div className={css.status} data-textpreview-state="loading">
        {meta.status === 'none'
          ? <p className={css.statusLine}>{t('resourceUnavailable')}</p>
          : <LoadingIndicator className={css.statusLine} label={t('loading')} />}
      </div>
    )
  }
  const next = loadedThrough + 1
  const { directory, name } = pathPartsOf(displayPath)
  const loadNext = (): void => {
    if (!canRead || current?.loading || current?.eof) return
    loadPage(tab.id, file, next, signal, meta.value?.version)
  }
  return (
    <div className={css.preview} data-textpreview-state="text" data-textpreview-url={tab.contentId} data-document-preview={selected.id}>
      {meta.failure !== undefined && hasContent
        ? (
          // The file's metadata failed — gone, or its workspace unknown — which
          // outranks a pending change; the pages already read stay under it.
          // With nothing read the body's own failure already says it, so the
          // bar would only repeat the same line.
          <p className={css.changed} data-textpreview-meta-failed={meta.failure.code}>
            <span>{failureLine(t, meta.failure)}</span>
            <button
              type="button"
              className={css.action}
              data-textpreview-reload-now
              onClick={reload}
            >
              {t('reloadNow')}
            </button>
          </p>
        )
        : changed && (
          <p className={css.changed} data-textpreview-changed>
            <span>{t('changed')}</span>
            <button
              type="button"
              className={css.action}
              data-textpreview-reload-now
              onClick={reload}
            >
              {t('reloadNow')}
            </button>
          </p>
        )}
      <div className={css.header}>
        <div ref={pathRef} className={css.path} title={displayPath} data-textpreview-path>
          <span ref={pathTextRef} className={css.pathText}>
            {directory !== '' && <span className={css.pathDirectory}>{directory}</span>}
            <span className={css.pathName}>{name}</span>
          </span>
        </div>
        {editable && (
          // The ranked claim sends the address to the editor type; an existing
          // editor tab for the file is revealed rather than duplicated.
          <Tooltip label={t('edit')} side="bottom" delayMs={500}>
            <button
              type="button"
              className={css.tool}
              aria-label={t('edit')}
              data-textpreview-tool="edit"
              onClick={() => { tabActions.openResource(tab.contentId) }}
            >
              <IconEditOutline16 />
            </button>
          </Tooltip>
        )}
        {candidates.length > 1
          && (
            <Menu
              open={menuOpen}
              anchor={(
                <button type="button" className={clsx(css.tool, css.viewerTool)} aria-label={t('openWith')} title={selected.title()} data-document-viewer-menu onClick={() => { setMenuOpen(value => !value) }}>
                  {selected.title()}
                </button>
              )}
              items={candidates.map(candidate => ({ id: candidate.id, label: candidate.title() }))}
              selectedId={selected.id}
              onSelect={(id) => { actions.selected(tab.id, id); setMenuOpen(false) }}
              onClose={() => { setMenuOpen(false) }}
              align="end"
              portal
              dense
            />
          )}
        {selected.wrap === true && (
          // The tooltip names the action while the stable aria name and
          // `aria-pressed` expose the control and its current state.
          <Tooltip label={t(state.wrap ? 'wrap.disable' : 'wrap.enable')} side="bottom" delayMs={500}>
            <button
              type="button"
              className={css.tool}
              aria-pressed={state.wrap}
              aria-label={t('wrap.aria')}
              data-textpreview-tool="wrap"
              onClick={() => { actions.toggledWrap(tab.id) }}
            >
              {state.wrap ? <IconNowrapFill16 /> : <IconWrapFill16 />}
            </button>
          </Tooltip>
        )}
        {content !== undefined && renderSlot('sidebar.right.tab.document.action', { content }, { entryKey: selected.id, hookContext: useTabInfo })}
        <span hidden>
          <Tooltip label={t(state.autoRefresh ? 'autoRefresh.disable' : 'autoRefresh.enable')} side="bottom" delayMs={500}>
            <button type="button" className={css.tool} aria-label={t('autoRefresh')}
              aria-pressed={state.autoRefresh} data-textpreview-tool="auto-refresh"
              onClick={() => { actions.toggledAutoRefresh(tab.id) }}>
              {state.autoRefresh ? <IconPauseOutline16 /> : <IconPlayOutline16 />}
            </button>
          </Tooltip>
        </span>
        <Tooltip label={t('reload')} side="bottom" delayMs={500}>
          <button
            type="button"
            className={css.tool}
            aria-label={t('reload')}
            data-textpreview-tool="reload"
            onClick={reload}
          >
            <IconRefreshOutline16 />
          </button>
        </Tooltip>
        {fileOwner !== undefined && renderSlot('sidebar.right.tab.document.actions', fileOwner)}
      </div>
      <div
        ref={bindBody}
        className={clsx(css.body, state.wrap && css.wrap)}
        data-textpreview-body
        data-textpreview-wrap={state.wrap ? '' : undefined}
        onMouseUp={showSelection}
        onScrollCapture={(event) => {
          const body = scrollportRef.current
          /* v8 ignore next -- callback refs bind the scrollport during commit, before user input. */
          if (body === null) return
          if (event.target !== body) return
          actions.scrolled(tab.id, body.scrollTop)
          if (mode === 'text-pages' && current?.failure === undefined && body.clientHeight > 0
            && body.scrollTop + body.clientHeight >= body.scrollHeight - 1) loadNext()
        }}
      >
        {mode !== 'renderer' && !hasContent && current?.failure === undefined && (
          <LoadingIndicator className={clsx(css.statusLine, css.bodyLoading)} label={t('loading')} />
        )}
        {content !== undefined && renderSlot('sidebar.right.tab.document', {
          resourceAddress: tab.contentId, content, wrap: state.wrap, scrollportRef: bindScrollport,
          addResource: add, setResources: set,
        }, {
          entryKey: selected.id, hookContext: useTabInfo,
          fallback: <p className={css.statusLine}>{t('rendererUnavailable', { name: selected.title() })}</p>,
        })}
        {current?.failure !== undefined && (hasContent
          ? (
            <p className={css.statusLine} data-textpreview-failed={current.failure.code}>
              <span>{failureLine(t, current.failure)}</span>
              <button
                type="button"
                className={css.action}
                data-textpreview-retry
                onClick={loadNext}
              >
                {t('retry')}
              </button>
            </p>
          )
          : (
            // With no content, retry the selected renderer's read; metadata
            // observation remains owned by the resource provider.
            <div className={css.empty} data-textpreview-failed={current.failure.code}>
              <FileTypeIcon kind={classifyFileType(name)} size={36} className={css.emptyIcon} />
              <p className={css.emptyLine}>{failureLine(t, current.failure)}</p>
              <button
                type="button"
                className={css.retry}
                data-textpreview-retry
                onClick={reload}
              >
                <IconRefreshOutline16 size={14} />
                {t('retry')}
              </button>
            </div>
          ))}
        {mode === 'text-pages' && current !== undefined && loaded.length > 0 && !current.eof && current.failure === undefined && (
          <button
            type="button"
            className={css.more}
            disabled={current.loading}
            data-textpreview-more
            onClick={loadNext}
          >
            {current.loading ? <LoadingIndicator label={t('loading')} /> : t('loadMore')}
          </button>
        )}
      </div>
      {selectionPopup.popup !== null && createPortal(
        // Fixed to the viewport, so it is portaled out of the pane: the body's
        // scrollport would otherwise clip a button anchored above the line.
        <button
          type="button"
          ref={selectionPopup.buttonRef}
          className={css.selectionPopup}
          data-textpreview-selection-popup
          style={{ left: selectionPopup.popup.left, top: selectionPopup.popup.top }}
          // Keep the selection (and the caret) alive until the click commits.
          onMouseDown={(event) => { event.preventDefault() }}
          onClick={() => { selectionPopup.commit() }}
        >
          {t('addToConversation')}
        </button>,
        document.body,
      )}
    </div>
  )
}
