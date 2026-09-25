/** Sidebar-owned command resolved against the currently mounted page. */
import type { Shortcuts, ShortcutCommandId } from '@qilin/client-shortcuts/client'
import type { TranslateNS } from '@qilin/client-locale/client'
import type { SidebarRightController } from './service.ts'
import type {} from './locales.ts'

/**
 * Register the sidebar command over the controller used by its visible controls.
 * @param shortcuts - effective-binding registry for this window.
 * @param sidebar - current Session and page owner.
 * @param t - current localized command and unavailable labels.
 * @returns release callback for the command.
 */
export function registerSidebarShortcuts(shortcuts: Pick<Shortcuts, 'register'>, sidebar: SidebarRightController,
  t: TranslateNS<'sidebarRight'>): () => void {
  return shortcuts.register({
    id: 'sidebar.right.toggle' as ShortcutCommandId, label: () => t('command.toggle'), aliases: ['right sidebar', 'toggle right panel'],
    defaults: {
      'desktop:macos': { code: 'KeyB', modifiers: ['primary', 'alt'] },
      'desktop:windows': { code: 'KeyB', modifiers: ['primary', 'alt'] },
      'desktop:linux': { code: 'KeyB', modifiers: ['primary', 'alt'] },
      'web:macos': { code: 'KeyB', modifiers: ['primary', 'shift'] },
      'web:windows': { code: 'KeyB', modifiers: ['primary', 'shift'] },
    },
    regions: ['page', 'editable', 'terminal'], modals: [],
    resolve: () => {
      if (!sidebar.hasSession()) return { status: 'blocked', reason: t('command.noSession') }
      return { status: 'handled', run: () => { sidebar.toggleExpanded() } }
    },
  })
}
