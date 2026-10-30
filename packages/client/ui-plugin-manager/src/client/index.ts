/**
 * Plugin manager, browser half: the **Plugins** settings section of the
 * settings shell. The page installs, enables, disables, and removes the
 * bundles of the Host's profile through the `pluginManager` Remote and
 * switches their rows in the profile's user layer. A plugin that carries its
 * own configuration renders it on this page through the slots the page
 * declares (`slot-contract.ts`).
 */
import type {} from '@qilin-agent/client-product-analytics/client'
import type {} from '@qilin-agent/client-locale/client'
import type { Context as ClientContext } from '@qilin-agent/kylin'
// Type-only: the `shell.overlay` slot the refresh toast registers into, declared
// by ui-layout (the settings page no longer owns any panel of its own).
import type {} from '@qilin-agent/client-ui-layout/client'
// Type-only: the settings slot declarations the page registers into, and the
// settingsShell open channel this plugin calls (both merges arrive through the
// settings packages' client-safe type subpaths).
import type {} from '@qilin-agent/client-ui-settings/client'
import type {} from '@qilin-agent/client-ui-settings-general/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@qilin-agent/api-remotes/client'
// Type-only: the forwarded events' own declaration (`$on`'s key face resolves
// through the owning package's client-safe types subpath).
import type {} from '@qilin-agent/plugin-manager/types'
import { PluginManagerPage } from './PluginManagerPage.tsx'
import { createPluginHeaderRef } from './header-scroll.ts'
import { PluginRefreshToast, type PluginRefreshToastFace } from './PluginRefreshToast.tsx'
import { configLedgerSource } from './config-ledger.ts'
import { tabLedgerSource } from './tab-ledger.ts'
import { PluginManagerController } from './manager-store.ts'
import { en, zh, type PluginManagerLocaleKey } from './locales.ts'
import { createNavigationStore } from './navigation-store.ts'
import type {} from './slot-contract.ts'

declare module '@qilin-agent/kylin' {
  interface Context {
    /** Cross-plugin navigation to the Plugins panel. */
    pluginNavigation: {
      /**
       * Open a bundle's details without changing the current Session.
       * An absent bundle displays the plugin list after loading.
       * @param packageName - npm package name of the bundle.
       */
      openBundle(packageName: string): void
      /** Open the Plugins main list without opening a dialog or changing the current Session. */
      openList(): void
    }
  }
}

export type { PluginManagerPageProps } from './PluginManagerPage.tsx'
export type { ConfigLedger, OfficialItem } from './config-ledger.ts'
export type { PluginManagerFace } from './manager-store.ts'
export type { PluginManagerLocaleKey } from './locales.ts'
export type {
  ConfigPageForm, PluginActivationOwnerProps, PluginAddActionsProps, PluginTabInstall, PluginTabProps,
  PluginConfigViewProps, PluginDetailProps, PluginPackageRef, PluginRowRef, PluginsSubject,
} from './slot-contract.ts'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin manager tab copy. */
    'pluginManager': PluginManagerLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'pluginManager'

/** The settings section id that renders the management page. */
export const PANEL_ID = 'plugins'

/** Services required by the sidebar registration and the Remote methods; the inventory says whether the Host manages a profile. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginManager', 'remote.pluginInventory', 'remote.pluginRegistryProbe', 'configForms']

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
      // A profile change can replace a bundle's files, and a restarted Host is read afresh.
      controller.details.reset()
      if (controller.getSnapshot().status !== 'idle') void controller.load()
    }
    const disposers = [
      ctx.remote.$on('plugin-manager/changed', refresh),
      ctx.remote.$on('plugin-manager/install-log', (chunk) => { controller.appendLog(chunk) }),
      ctx.remote.$on('plugin-manager/install-state', (progress) => { controller.installProgress(progress) }),
      ctx.remote.$on('plugin-manager/update-state', (progress) => { controller.updateProgress(progress) }),
      ctx.on('connection/reset', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-plugin-manager: host invalidations')

  // The page is a settings section: it belongs to the profile, not to a
  // Session, and the settings shell's nav selects it. What is installed and
  // switched on is the page's own; a plugin's configuration arrives through the
  // slots the page declares here, so the page never names a configurable plugin.
  const configLedger = configLedgerSource(ctx)
  const face = controller.inject(configLedger, tabLedgerSource(ctx), text => ctx.locale.resolveText(text))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'plugin-manager.refresh-toast', locale: NS,
    inject: (): PluginRefreshToastFace => ({
      hooks: { pluginManager: face.hooks.pluginManager },
      dismissNotice: face.dismissNotice,
    }),
  }, PluginRefreshToast))
  // The section's store and the cross-plugin navigation share one handle, so a
  // request that arrives before the shell mounts still aims the next open.
  const handle = createNavigationStore(), instance = handle.create()
  const store: typeof handle = { ...handle, create: () => instance }
  ctx.slots.inject('settings.section', function* () {
    yield ctx.slots.register({
      name: 'settings.section',
      id: PANEL_ID,
      order: 15,
      label: () => t('panel'),
      locale: NS,
      store,
      inject: () => ({ ...face, createHeaderRef: createPluginHeaderRef }),
      children: {
        'plugins.add.actions': { kind: 'list', scope: 'root' },
        'plugins.tab': { kind: 'list', scope: 'root' },
        'plugins.item': { kind: 'list', scope: 'root' },
        'plugins.bundle.activation': { kind: 'keyed', scope: 'root' },
        'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
        'plugins.detail.actions': { kind: 'list', scope: 'root' },
        'plugins.detail.badge': { kind: 'list', scope: 'root' },
        'plugins.detail.section': { kind: 'list', scope: 'root' },
      },
    }, PluginManagerPage)
  })
  // Cross-plugin navigation reveals the section first, then aims the shared
  // store at the requested list or bundle. The provider belongs to this plugin's
  // fiber, not to the shell's section cell, so it outlives a shell remount.
  ctx.effect(() => ctx.reflect.provide('pluginNavigation', {
    openList: () => {
      ctx.get('settingsShell')?.open(PANEL_ID)
      instance.actions.setTab('installed')
      instance.actions.setView({ kind: 'list' })
    },
    openBundle: (packageName: string) => {
      ctx.get('settingsShell')?.open(PANEL_ID)
      instance.actions.setTab('installed')
      instance.actions.setView({ kind: 'package', name: packageName })
    },
  }), 'ui-plugin-manager: navigation')

}
