/** MCP servers page, browser half: one workspace panel opened from the sidebar. */

import { createElement } from 'react'
import type { Context as ClientContext } from '@qilin-agent/kylin'
import { IconApiOutlineMedium, IconApiOutlineRegular } from '@qilin-agent/client-ui-primitives'
import type { MainPanelId } from '@qilin-agent/client-ui-layout/client'
import type { PropsRuntime } from '@qilin-agent/client-ui-slots'
import type {} from '@qilin-agent/client-locale/client'
// Type-only: pulls the `sidebar.panellist` slot and its owner props.
import type {} from '@qilin-agent/client-ui-sidebar/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
// Type-only: pulls the `ctx.remote` merge and the mcpServers namespace row.
import type {} from '@qilin-agent/api-remotes/client'
import type { McpSectionInjected } from './McpSection.tsx'
import { McpPanelPage } from './McpPanelPage.tsx'
import { McpServersStore } from './store.ts'
import { en, zh, type McpLocaleKey } from './locales.ts'

export type { McpSectionInjected, McpSectionProps } from './McpSection.tsx'
export type { McpPanelPageProps } from './McpPanelPage.tsx'
export type { McpPageState, McpServersStore } from './store.ts'
export type { McpLocaleKey } from './locales.ts'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** MCP servers page copy. */
    'settings.mcp': McpLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.mcp'

/** Sidebar row id and matching main panel key. */
export const MCP_PANEL_ID = 'mcp' as MainPanelId

/** Services required by the panel registration and the generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.mcpServers']

/**
 * MCP servers sidebar glyph: the protocol mark at the rail's requested size,
 * drawn heavier while the panel is selected.
 * @param props - owner props supplied by the sidebar's panel row.
 * @returns the protocol glyph.
 */
const McpNavIcon = ({ size, active }: PropsRuntime<'sidebar.panellist'>) => createElement(
  active ? IconApiOutlineMedium : IconApiOutlineRegular,
  { size },
)

/**
 * Register the MCP servers panel and its sidebar row, and hand both the one
 * store every mount shares.
 *
 * The page lives in the workspace sidebar's General section rather than in
 * Settings: connecting a server is a workspace-level action, not a preference.
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

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: MCP_PANEL_ID,
    locale: NS,
    inject: injected,
  }, McpPanelPage))

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: MCP_PANEL_ID,
    order: 20,
    locale: NS,
    label: () => t('nav'),
  }, McpNavIcon))
}
