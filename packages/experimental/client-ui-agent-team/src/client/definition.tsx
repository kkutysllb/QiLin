/**
 * Stage one of this package's registration: what the `agent-team` tab type IS.
 *
 * The type is a page, not a viewer: it claims no address, so a tab of this
 * kind is opened by kind alone — from the guide page's entry box, or from
 * anywhere that calls `ctx.sidebarRight.openTab('agent-team')`.
 */
import type { TranslateNS } from '@qilin-agent/client-ui-slots'
import { IconUserOutline16 } from '@qilin-agent/client-ui-primitives'
import type { SidebarRightTabDefinition } from '@qilin-agent/client-ui-sidebar-right/client'
import type {} from './locales.ts'

/** The tab kind this package owns; `ctx.sidebarRight.openTab` names it. */
export const TEAM_KIND = 'agent-team'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const TEAM_ID = '@qilin-agent/experimental-client-ui-agent-team'

/**
 * The Team type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function teamDefinition(t: TranslateNS<'agent-team'>): SidebarRightTabDefinition {
  return {
    id: TEAM_ID,
    kind: TEAM_KIND,
    priority: 'builtin',
    label: () => t('trigger'),
    icon: IconUserOutline16,
    // One page per surface: reopening the guide entry focuses the page the user
    // already has rather than seating a second one.
    single: true,
    title: () => t('trigger'),
    guide: [{
      id: 'agent-team',
      order: 30,
      title: () => t('guide.title'),
      description: () => t('guide.description'),
      icon: IconUserOutline16,
    }],
  }
}
