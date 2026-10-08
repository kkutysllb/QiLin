/** Read-only Host plugin inventory registered into Web Settings. */

import type {} from '@qilin-agent/client-locale/client'
import type {} from '@qilin-agent/client-modules/client'
import type { Context as ClientContext } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-ui-settings/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
// Inline-safe shared fold: shipped ids map to dictionary keys in one home.
import { presetDisplayText } from '@qilin-agent/agent-presets/display'
import { PluginInventorySettingsTab, type PluginInventorySettingsTabInjected } from './PluginInventorySettingsTab.tsx'
import { en, zh, type PluginInventoryLocaleKey } from './locales.ts'

export type { PluginInventorySettingsTabInjected, PluginInventorySettingsTabProps } from './PluginInventorySettingsTab.tsx'
export type { PluginInventoryLocaleKey } from './locales.ts'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Read-only Host plugin inventory copy. */
    'settings.pluginInventory': PluginInventoryLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginInventory'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginInventory', 'modules']

/** Contribute the lazy inventory tab to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugin-inventory: dictionaries')

  const t = ctx.locale.bind(NS)
  const list: PluginInventorySettingsTabInjected['list'] = async () => {
    const result = await ctx.remote.pluginInventory.list()
    if (!result.ok) {
      throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  // Resolved per call over this plugin's own dictionaries, so a language
  // switch re-resolves shipped names; user-authored metadata passes through.
  // The tab cannot read ui-agent-preset's namespace: the shipped Web
  // composition disables that plugin (dual-workbench design, D4), and a
  // namespace its owner never registered resolves to raw keys.
  const presetName: PluginInventorySettingsTabInjected['presetName'] = preset =>
    presetDisplayText(preset, t).name
  const injected = (): PluginInventorySettingsTabInjected => ({
    list, presetName,
    hooks: { clientSync: ctx.modules.entries.state },
    retryClient: () => { void ctx.modules.entries.retry().catch((error: unknown) => { ctx.logger.error(error) }) },
  })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'all',
    order: 10,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginInventorySettingsTab))
}
