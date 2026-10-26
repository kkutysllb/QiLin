/** Rows for the More menus of the left sidebar, Conversation View tabs, and right-sidebar guide. */
import type { Context } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-locale/client'
import type {} from '@qilin-agent/client-product-analytics/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
import type {} from '@qilin-agent/client-ui-sidebar/client'
import type {} from '@qilin-agent/client-ui-conversation/client'
import type {} from '@qilin-agent/client-ui-sidebar-right/client'
import type {} from '@qilin-agent/client-ui-plugin-manager/client'
import type {} from '@qilin-agent/client-ui-workspace/client'
import { EntryMenuContent, type EntryMenuInjected, type EntryRegion } from './EntryMenuContent.tsx'
import { en, zh } from './locales.ts'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** More menu rows: navigation actions, and Creator draft prompts. */
    entryCustomization: keyof typeof en
  }
}

/** QiLin's shipped runtime-authoring preset the Creator draft starts under. */
const CREATOR_PRESET = 'ptc'

/** Services used by the menu rows' footer actions. */
export const inject = ['slots', 'locale', 'pluginNavigation', 'uiWorkspace']

/**
 * Register the same menu rows into each region's More menu.
 * @param ctx - Browser context with slot, locale, plugin navigation, and Workspace services.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('entryCustomization', { en, zh }))
  const t = ctx.locale.bind('entryCustomization')
  const injected = (region: EntryRegion): EntryMenuInjected => ({
    region,
    browsePlugins: () => {
      ctx.get('productAnalytics')?.track('more_menu_item_click', { region, action: 'browse_plugins' })
      ctx.pluginNavigation.openList()
    },
    createPlugin: () => {
      ctx.get('productAnalytics')?.track('more_menu_item_click', { region, action: 'create_plugin' })
      ctx.uiWorkspace.startSession(undefined, {
        agentPreset: CREATOR_PRESET, prompt: t(`createPrompt.${region}`), whenDraftExists: 'append',
      })
    },
  })
  ctx.slots.inject('sidebar.panellist.actions', () => ctx.slots.register({
    name: 'sidebar.panellist.actions', id: 'entry-customization', locale: 'entryCustomization',
    inject: () => injected('sidebar'),
  }, EntryMenuContent))
  ctx.slots.inject('conversation.session.header.views.actions', () => ctx.slots.register({
    name: 'conversation.session.header.views.actions', id: 'entry-customization', locale: 'entryCustomization',
    inject: () => injected('conversation'),
  }, EntryMenuContent))
  ctx.slots.inject('sidebar.right.tab.guide.actions', () => ctx.slots.register({
    name: 'sidebar.right.tab.guide.actions', id: 'entry-customization', locale: 'entryCustomization',
    inject: () => injected('rightbar'),
  }, EntryMenuContent))
}
