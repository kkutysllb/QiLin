/** macOS-desktop conversation-header controls for the fully hidden sidebar. */
import {
  IconNewChatOutline16, IconPanelLeftOutline16, isDarwinDesktop, Tooltip,
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
 * a selected Session. On macOS desktop a collapsed sidebar hides entirely (no
 * rail), taking both controls off screen; this occupant puts them back beside
 * the traffic lights. Mounted whenever the platform matches; visibility rides the
 * AppFrame-published `data-sidebar-collapsed` attribute in CSS, so no
 * collapse-state pipe is added here.
 * @param props - Injected sidebar actions plus the sidebar locale seat.
 * @returns the two header controls, or null off macOS desktop.
 */
export function HeaderLeadingControls({ toggleSidebar, startSession, useShortcuts, t }: HeaderLeadingControlsProps) {
  const shortcut = useShortcuts(rows => rows.find(row => row.id === 'sidebar.left.toggle'))
  const newShortcut = useShortcuts(rows => rows.find(row => row.id === 'session.new'))
  const newHint = newShortcut?.keys.length ? t('shortcut.hint', { label: t('session.new.label'), keys: newShortcut.keys.join(' ') }) : t('session.new.label')
  if (!isDarwinDesktop()) return null
  return (
    <div className={css.controls}>
      <Tooltip label={shortcut?.keys.length ? t('shortcut.hint', { label: t('toggle.open'), keys: shortcut.keys.join(' ') }) : t('toggle.open')} delayMs={500}>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('toggle.open')}
          aria-keyshortcuts={shortcut?.aria}
          onClick={() => { toggleSidebar() }}
        >
          <IconPanelLeftOutline16 size={16} />
        </button>
      </Tooltip>
      <Tooltip label={newHint} delayMs={500}>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('session.new.label')}
          aria-keyshortcuts={newShortcut?.aria}
          onClick={() => { startSession() }}
        >
          <IconNewChatOutline16 size={16} />
        </button>
      </Tooltip>
    </div>
  )
}
