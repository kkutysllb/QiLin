/** Browser plugin contributing the Session Inspector Log sidebar tab. */

import type { Context } from '@qilin/kylin'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-sidebar-right/client'
import { en, NS, zh } from './locales.ts'
import { registerInspectorTab } from './views/index.ts'

/** Services required to register the localized Session-bound sidebar tab. */
export const inject = ['slots', 'locale', 'sessions', 'uiSession', 'uiConversation', 'sidebarRightTabs']

/**
 * Register the Inspector tab for this plugin's lifetime.
 * @param ctx - Client plugin context owning the dictionaries and registrations.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'session-inspector: dictionaries')
  registerInspectorTab(ctx)
}
