/** macOS-desktop conversation-header controls for the fully hidden sidebar. */
import {
  IconNewChatOutlineRegular, IconPanelLeftOutlineRegular, isDarwinDesktop, Tooltip,
} from '@qilin-agent/client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
// Type-only: pulls the conversation header slot declarations.
import type {} from '@qilin-agent/client-ui-conversation/client'
import type { SidebarRootInjected } from './contract/slots.ts'
import css from './HeaderLeadingControls.module.css'

/** Full props of the conversation-header leading occupant. */
export type HeaderLeadingControlsProps =
  PropsRuntime<'conversation.header.leading'>
  & InjectFace<SidebarRootInjected>
  & PropsLocale<'sidebar'>

/**
 * Sidebar-open and New Session controls in the conversation header's
 * root-scoped leading seat, which the resident header renders with or without
 * a selected Session. A hidden sidebar keeps no rail, so this occupant puts the
 * opener back in the header; CSS shows it only while the frame reports a hidden
 * sidebar, whether that is the macOS desktop collapse or the narrow drawer.
 * New Session belongs to the desktop collapse alone (the drawer owner keeps its
 * own primary action). The opener carries `data-sidebar-opener`, the handoff
 * target the sidebar focuses when a drawer closes.
 * @param props - Injected sidebar actions plus the sidebar locale seat.
 * @returns the header controls; CSS decides whether they are visible.
 */
export function HeaderLeadingControls({ toggleSidebar, startSession, trackEntryClick, useShortcuts, t }: HeaderLeadingControlsProps) {
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'sidebar.left.toggle'))
  const newShortcut = useShortcuts(rows => rows.find(row => row.id === 'session.new'))
  const newHint = newShortcut?.keys.length ? t('shortcut.hint', { label: t('session.new.label'), keys: newShortcut.keys.join(' ') }) : t('session.new.label')
  const darwinDesktop = isDarwinDesktop()
  return (
    <div className={css.controls}>
      <Tooltip label={shortcut?.keys.length ? t('shortcut.hint', { label: t('toggle.open'), keys: shortcut.keys.join(' ') }) : t('toggle.open')} delayMs={500}>
        <button
          data-sidebar-opener=""
          type="button"
          className={css.iconButton}
          aria-label={t('toggle.open')}
          aria-keyshortcuts={shortcut?.aria}
          onClick={() => { toggleSidebar() }}
        >
          <IconPanelLeftOutlineRegular size={16} />
        </button>
      </Tooltip>
      {darwinDesktop && <Tooltip label={newHint} delayMs={500}>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('session.new.label')}
          aria-keyshortcuts={newShortcut?.aria}
          onClick={() => {
            trackEntryClick({ menu_name: 'new_session', position: 'titlebar' })
            startSession()
          }}
        >
          <IconNewChatOutlineRegular size={16} />
        </button>
      </Tooltip>}
    </div>
  )
}
