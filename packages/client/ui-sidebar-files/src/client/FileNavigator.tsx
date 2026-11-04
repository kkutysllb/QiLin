/**
 * One preview pane's workspace navigator: the tree beside the file the pane
 * shows, drawn from that pane's own store bucket.
 *
 * This is the reusable face of the package's tree: the `files` page draws the
 * same `FileTree` in its body, and a preview draws it here, under its own
 * header and beside its own content, through the Factory ui-sidebar-right
 * renders. The pane owns the tree, not the tab, so switching previews in one
 * pane redraws it unchanged; the last drawing to go forgets it, together with
 * its expanded levels.
 *
 * Row gestures go to the shared context menu (`getTriggerProps`), whose
 * contributions this package supplies for `file` and `directory` targets; the
 * tree owns no popup of its own.
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { FactoryComponentPropsOf } from '@qilin-agent/client-ui-slots'
import type { UseSidebarRightTabInfo } from '@qilin-agent/client-ui-sidebar-right/client'
import type {} from '@qilin-agent/client-ui-context-menu/client'
import { fileAddressFor, parseFileAddress } from '@qilin-agent/util-workspace-path'
import { FileTree } from './FileTree.tsx'
import { joinEntryPath } from './file-mutations.ts'
import type { FilesNavigatorInjected } from './face.ts'
import type { createFilesStore } from './store.ts'
import type {} from './locales.ts'
import css from './FilesBody.module.css'

/** What a navigator occurrence is drawn for. */
export interface FileNavigatorInput {
  /** The tab the navigator is drawn beside, and its pane. */
  readonly useTabInfo: UseSidebarRightTabInfo
  /** Ask the containing plugin to open a file. @param address - the file's resource address. */
  readonly onOpen: (address: string) => void
}

declare module '@qilin-agent/client-ui-slots' {
  interface SlotFactoryMap {
    /** One pane's workspace tree beside a preview it belongs to. */
    'sidebar.files.navigator': {
      scope: 'session'
      props: FileNavigatorInput
      store: ReturnType<typeof createFilesStore>
      locale: 'sidebarFiles'
      inject: FilesNavigatorInjected
    }
  }
}

/**
 * The navigator Factory's component.
 * @param props - the tab it is drawn beside, the pane's store records, the tree's face, and copy.
 * @returns the navigator, or nothing while hidden or without a workspace.
 */
export function FileNavigator({
  useTabInfo, onOpen, sessionId, useSessions, useStore, attach, start, toggle, scrolled, t, useContextMenu,
}: FactoryComponentPropsOf<'sidebar.files.navigator'>): ReactNode {
  const { tab, panel } = useTabInfo()
  const { getTriggerProps } = useContextMenu()
  const paneId = panel.id
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  const pane = useStore(store => store.navigators[paneId])
  const open = pane?.open === true
  const tree = pane !== undefined && pane.tree?.root === cwd ? pane.tree : undefined
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const scrollTopRef = useRef(0)
  const signal = tab.signal

  useEffect(() => { attach(paneId, signal) }, [attach, paneId, signal])
  useEffect(() => {
    if (!open || cwd === undefined || tree !== undefined || signal.aborted) return
    start(paneId, cwd, signal)
  }, [open, cwd, tree, paneId, signal, start])
  // Come back where the reader was: the pane's levels outlive the body, so a
  // remount lays the tree out at full height before this runs.
  const seeded = tree !== undefined
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (seeded && body !== null) {
      body.scrollTop = tree.scrollTop
      scrollTopRef.current = body.scrollTop
    }
  }, [seeded])
  useEffect(() => () => {
    if (seeded && !signal.aborted) scrolled(paneId, scrollTopRef.current)
  }, [seeded, signal, paneId, scrolled])

  const rowTriggerProps = useCallback((path: string, kind: 'file' | 'directory') => getTriggerProps(kind === 'directory'
    ? { kind, value: { sessionId, path } }
    : { kind, value: { sessionId, path, paneId } }), [getTriggerProps, sessionId, paneId])

  if (cwd === undefined || !open) return null
  // The preview's own file, as the tree keys it, so its row reads as current:
  // the tree keys every entry by absolute path, so a relative address is
  // joined to the root.
  const shownPath = parseFileAddress(tab.contentId)?.path
  return (
    <aside
      className={css.navigator}
      aria-label={t('guide.title')}
      data-files-navigator={paneId}
      data-files-state="tree"
      data-files-root={cwd}
    >
      <div
        ref={bodyRef}
        className={css.body}
        tabIndex={-1}
        data-files-body
        onScroll={(event) => { scrollTopRef.current = event.currentTarget.scrollTop }}
      >
        {tree === undefined
          ? <p className={css.note} data-files-row="loading">{t('loading')}</p>
          : (
            <FileTree
              state={tree}
              current={shownPath === undefined ? undefined : shownPath.startsWith('/') ? shownPath : joinEntryPath(tree.root, shownPath)}
              onToggle={(path) => { toggle(paneId, path, tree.levels[path] !== undefined, signal) }}
              onOpen={(path) => { onOpen(fileAddressFor(sessionId, tree.root, path)) }}
              onCreate={() => {}}
              onRename={() => {}}
              onDelete={() => {}}
              rowTriggerProps={rowTriggerProps}
              t={t}
            />
          )}
      </div>
    </aside>
  )
}
