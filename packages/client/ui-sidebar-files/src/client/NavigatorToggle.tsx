/**
 * The navigator's show/hide control, at the end of a preview's header through
 * its Factory; the `files` page's tree always shows and has none. It writes the
 * pane's choice, which every preview tab of that pane reads.
 */
import type { ReactNode } from 'react'
import type { FactoryComponentPropsOf } from '@qilin-agent/client-ui-slots'
import type { UseSidebarRightTabInfo } from '@qilin-agent/client-ui-sidebar-right/client'
import { IconFolderCloseRegular, IconFolderOpenRegular, Tooltip } from '@qilin-agent/client-ui-primitives'
import type { FilesNavigatorInjected } from './face.ts'
import type { createFilesStore } from './store.ts'
import type {} from './locales.ts'
import css from './FilesBody.module.css'

/** The tab whose pane's navigator this control toggles. */
export interface NavigatorToggleInput {
  readonly useTabInfo: UseSidebarRightTabInfo
}

declare module '@qilin-agent/client-ui-slots' {
  interface SlotFactoryMap {
    /** Show or hide the pane's workspace tree; absent without a working directory. */
    'sidebar.files.navigator.toggle': {
      scope: 'session'
      props: NavigatorToggleInput
      store: ReturnType<typeof createFilesStore>
      locale: 'sidebarFiles'
      inject: Pick<FilesNavigatorInjected, 'shown'>
    }
  }
}

/**
 * Show or hide one pane's navigator.
 * @param props - the tab, the pane's store record, the face's write, and copy.
 * @returns the toggle, or nothing without a workspace.
 */
export function NavigatorToggle(
  { useTabInfo, sessionId, useSessions, useStore, shown, t }: FactoryComponentPropsOf<'sidebar.files.navigator.toggle'>,
): ReactNode {
  const { panel } = useTabInfo()
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  const open = useStore(store => store.navigators[panel.id]?.open) === true
  if (cwd === undefined) return null
  const label = t(open ? 'navigator.hide' : 'navigator.show')
  return (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <button
        type="button"
        className={css.tool}
        aria-label={label}
        aria-expanded={open}
        data-files-navigator-toggle
        onClick={() => { shown(panel.id, !open) }}
      >
        {open ? <IconFolderOpenRegular /> : <IconFolderCloseRegular />}
      </button>
    </Tooltip>
  )
}
