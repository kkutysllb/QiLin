/**
 * Stage one of this package's registration: what the `sidechat` tab type is.
 *
 * The type is a page, not a viewer: it claims no address, so a tab of this
 * kind is opened by kind alone — `ctx.sidebarRight.openTab('sidechat')`.
 */
import type { TranslateNS } from '@qilin-agent/client-locale/client'
import { IconNewChatOutline16 } from '@qilin-agent/client-ui-primitives'
import type { SidebarRightTabDefinition } from '@qilin-agent/client-ui-sidebar-right/client'
import type {} from './locales.ts'

/** The tab kind this package owns; `ctx.sidebarRight.openTab` names it. */
export const SIDECHAT_KIND = 'sidechat'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const SIDECHAT_ID = '@qilin-agent/client-ui-sidechat'

/**
 * The sidechat type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function sidechatDefinition(t: TranslateNS<'sidebarSidechat'>): SidebarRightTabDefinition {
  return {
    id: SIDECHAT_ID,
    kind: SIDECHAT_KIND,
    priority: 'builtin',
    label: () => t('type.label'),
    icon: IconNewChatOutline16,
    // One page per surface: reopening focuses the page the user already has
    // rather than seating a second one; the page switches threads in place.
    single: true,
    title: () => t('type.label'),
  }
}
