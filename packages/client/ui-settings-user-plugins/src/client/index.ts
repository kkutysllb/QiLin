/** User-installed QiLin and DSH plugin management Settings contribution. */

import type { Context as ClientContext } from '@qilin/kylin'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-settings/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/api-remotes/client'
import { UserPluginsSettingsTab, type UserPluginsSettingsTabInjected } from './UserPluginsSettingsTab.tsx'
import { en, zh, type UserPluginsLocaleKey } from './locales.ts'

export type { UserPluginsSettingsTabInjected, UserPluginsSettingsTabProps } from './UserPluginsSettingsTab.tsx'
export type { UserPluginsLocaleKey } from './locales.ts'

declare module '@qilin/client-ui-slots' {
  interface LocaleNamespaceMap { 'settings.userPlugins': UserPluginsLocaleKey }
}

const NS = 'settings.userPlugins'
export const inject = ['slots', 'locale', 'remote', 'remote.pluginManager']

/** Register the user plugin management tab under Settings > Plugins. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-user-plugins: dictionaries')
  const t = ctx.locale.bind(NS)
  const injected = (): UserPluginsSettingsTabInjected => ({
    list: async () => {
      const result = await ctx.remote.pluginManager.list()
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    install: async (spec) => {
      const result = await ctx.remote.pluginManager.installPlugin(spec)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    update: async (name) => {
      const result = await ctx.remote.pluginManager.updatePlugin(name)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    remove: async (name) => {
      const result = await ctx.remote.pluginManager.uninstallPlugin(name)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    checkUpdates: async () => {
      const result = await ctx.remote.pluginManager.checkUpdates()
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    catalog: async (query, page) => {
      const result = await ctx.remote.pluginManager.catalog(query, page)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
  })
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab', id: 'user-plugins', order: 20,
    label: () => t('tab'), locale: NS, inject: injected,
  }, UserPluginsSettingsTab))
}
