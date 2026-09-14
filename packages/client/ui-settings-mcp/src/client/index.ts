/** MCP servers settings page for the Web client. */

import type { Context as ClientContext } from '@qilin/kylin'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-settings/client'
import type {} from '@qilin/client-ui-renderer/client'
// Type-only: pulls the ctx.remote merge and the mcpServers namespace row.
import type {} from '@qilin/api-remotes/client'
import { McpSection } from './McpSection.tsx'
import type { McpSectionInjected } from './McpSection.tsx'
import { McpServersStore } from './store.ts'
import { en, zh, type McpLocaleKey } from './locales.ts'

export type { McpSectionInjected, McpSectionProps } from './McpSection.tsx'
export type { McpPageState, McpServersStore } from './store.ts'
export type { McpLocaleKey } from './locales.ts'

declare module '@qilin/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** MCP servers page copy. */
    'settings.mcp': McpLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.mcp'

/** Services required by the settings registration and the generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.mcpServers']

/**
 * Register the MCP servers page once the settings shell declares its section
 * slot, and hand it the one store every mount shares.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-mcp: copy dictionaries')

  const controller = new McpServersStore(ctx)
  const t = ctx.locale.bind(NS) as McpSectionInjected['t']
  const injected = (): McpSectionInjected => ({
    controller,
    hooks: { snapshot: controller.store },
    t,
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'mcp',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, McpSection))
}
