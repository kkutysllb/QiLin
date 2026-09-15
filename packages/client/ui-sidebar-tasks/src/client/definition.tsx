/**
 * Stage one of this package's registration: what the `tasks` tab type IS.
 *
 * The type is a page, not a viewer: it claims no address, so a tab of this kind
 * is opened by kind alone — from the guide page's entry box, or from anywhere
 * that calls `ctx.sidebarRight.openTab('tasks')`.
 */
import type { TranslateNS } from '@qilin/client-locale/client'
import { IconChecklistOutline14 } from '@qilin/client-ui-primitives'
import type { SidebarRightTabDefinition } from '@qilin/client-ui-sidebar-right/client'
import type {} from './locales.ts'

/** The tab kind this package owns; `ctx.sidebarRight.openTab` names it. */
export const TASKS_KIND = 'tasks'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const TASKS_ID = '@qilin/client-ui-sidebar-tasks'

/**
 * The tasks type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function tasksDefinition(t: TranslateNS<'sidebarTasks'>): SidebarRightTabDefinition {
  return {
    id: TASKS_ID,
    kind: TASKS_KIND,
    priority: 'builtin',
    label: () => t('type.label'),
    icon: IconChecklistOutline14,
    // One page per surface: reopening the guide entry focuses the page the user
    // already has rather than seating a second one.
    single: true,
    title: () => t('type.label'),
    guide: [{
      id: 'tasks',
      order: 40,
      title: () => t('guide.title'),
      description: () => t('guide.description'),
      icon: IconChecklistOutline14,
    }],
  }
}
