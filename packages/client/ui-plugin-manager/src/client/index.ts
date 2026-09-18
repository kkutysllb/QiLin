/**
 * Plugin manager, browser half: the **Manage plugins** view inside the Settings
 * Plugins section. The page installs, enables, disables, and removes the
 * bundles of the Host's profile through the `pluginManager` Remote and switches
 * their rows in the profile's user layer.
 * A plugin that carries its own configuration renders it on this page through
 * the slots the page declares (`slot-contract.ts`).
 */

import type {} from '@qilin/client-locale/client'
import type { Context as ClientContext } from '@qilin/kylin'
// Type-only: the Settings shell declares the tab list this page registers into
// (`settings.plugins.tab`), and the Plugins section owner renders the tab and
// mounts the page inside it.
import type {} from '@qilin/client-ui-settings/client'
import type {} from '@qilin/client-ui-renderer/client'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@qilin/api-remotes/client'
// Type-only: the forwarded events' own declaration (`$on`'s key face resolves
// through the owning package's client-safe types subpath).
import type {} from '@qilin/plugin-manager/types'
import { PluginManagerPage } from './PluginManagerPage.tsx'
import { configLedgerSource } from './config-ledger.ts'
import { PluginManagerController } from './manager-store.ts'
import { en, zh, type PluginManagerLocaleKey } from './locales.ts'
import type {} from './slot-contract.ts'

export type { PluginManagerPageProps } from './PluginManagerPage.tsx'
export type { ConfigLedger, OfficialItem } from './config-ledger.ts'
export type { PluginManagerFace } from './manager-store.ts'
export type { PluginManagerLocaleKey } from './locales.ts'
export type { PluginConfigViewProps } from './slot-contract.ts'

declare module '@qilin/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin manager tab copy. */
    'pluginManager': PluginManagerLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'pluginManager'

/** Tab key of the management view in the Plugins settings section. */
export const TAB_ID = 'manage'

/** Services required by the tab registration and the Remote methods; the inventory says whether the Host manages a profile. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginManager', 'remote.pluginInventory']

/**
 * Contribute the Plugins entry to the sidebar with the management page it
 * opens, and keep it current on the Host's change events.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plugin-manager: dictionaries')
  const t = ctx.locale.bind(NS)
  const controller = new PluginManagerController(ctx)
  ctx.effect(() => () => { controller.dispose() }, 'ui-plugin-manager: controller')
  // The Host says when what is installed, enabled, or composed changed — from
  // this page, the CLI, or another browser — and streams install output.
  ctx.effect(() => {
    // A page never rendered holds no snapshot to refresh.
    const refresh = (): void => {
      if (controller.getSnapshot().status !== 'idle') void controller.load()
    }
    const disposers = [
      ctx.remote.$on('plugin-manager/changed', refresh),
      ctx.remote.$on('plugin-manager/install-log', (chunk) => { controller.appendLog(chunk) }),
      ctx.remote.$on('plugin-manager/install-state', (progress) => { controller.installProgress(progress) }),
      ctx.on('connection/reset', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-plugin-manager: host invalidations')

  // The management view is a tab of the Settings Plugins section: the section
  // owns the nav row, the tab bar, and the tab panel, so the Web sidebar carries
  // no Plugins entry of its own. What is installed and switched on is the page's
  // own; a plugin's configuration arrives through the slots the page declares
  // here, so the page never names a configurable plugin.
  const configLedger = configLedgerSource(ctx)
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: TAB_ID,
    order: 5,
    label: () => t('tab'),
    locale: NS,
    inject: () => controller.inject(configLedger),
    children: {
      'plugins.item': { kind: 'list', scope: 'root' },
      'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
      'plugins.row.config': { kind: 'keyed', scope: 'root' },
    },
  }, PluginManagerPage))

}
