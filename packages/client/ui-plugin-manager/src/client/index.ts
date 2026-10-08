/**
 * Plugin manager, browser half: the sidebar's **插件管理** entry with the main
 * panel it opens, and the management view inside the Settings Plugins section
 * — one page in both places. The page installs, enables, disables, and removes
 * the bundles of the Host's profile through the `pluginManager` Remote and
 * switches their rows in the profile's user layer.
 * A plugin that carries its own configuration renders it on this page through
 * the slots the page declares (`slot-contract.ts`).
 */

import type {} from '@qilin-agent/client-locale/client'
import type { Context as ClientContext } from '@qilin-agent/kylin'
// Type-only: declares the `shell.overlay` seat the refresh-failure toast
// registers into, so a failed refresh outlives the Plugins tab; also the
// `MainPanelId` brand the sidebar entry's panel id carries.
import type { MainPanelId } from '@qilin-agent/client-ui-layout/client'
// Type-only: the Settings shell declares the tab list this page registers into
// (`settings.plugins.tab`), and the Plugins section owner renders the tab and
// mounts the page inside it.
import type {} from '@qilin-agent/client-ui-settings/client'
// Type-only: pulls the ctx.settingsShell merge (the section open channel).
import type {} from '@qilin-agent/client-ui-settings-general/client'
// Type-only: the `sidebar.panellist` entry seat the sidebar row registers into.
import type {} from '@qilin-agent/client-ui-sidebar/client'
// Type-only: the Workbench face whose active tag the presentation gate reads.
import type { Workbench } from '@qilin-agent/client-ui-workbench/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@qilin-agent/api-remotes/client'
// Type-only: the forwarded events' own declaration (`$on`'s key face resolves
// through the owning package's client-safe types subpath).
import type {} from '@qilin-agent/plugin-manager/types'
import { PluginManagerPage } from './PluginManagerPage.tsx'
import { PluginsPanelIcon } from './PluginsPanelIcon.tsx'
import { PluginRefreshToast, type PluginRefreshToastFace } from './PluginRefreshToast.tsx'
import { configLedgerSource } from './config-ledger.ts'
import { installAudienceGate } from './admission.ts'
import { PluginManagerController } from './manager-store.ts'
import { en, zh, type PluginManagerLocaleKey } from './locales.ts'
import type {} from './slot-contract.ts'

export type { PluginManagerPageProps } from './PluginManagerPage.tsx'
export type { ConfigLedger, OfficialItem } from './config-ledger.ts'
export type { PluginManagerFace } from './manager-store.ts'
export type { PluginManagerLocaleKey } from './locales.ts'
export type { ConfigPageForm, PluginAddActionsProps, PluginConfigViewProps } from './slot-contract.ts'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin manager tab copy. */
    'pluginManager': PluginManagerLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'pluginManager'

/** Tab key of the management view in the Plugins settings section. */
export const TAB_ID = 'manage'

/** The id shared by the sidebar entry and the main panel it opens. */
export const PANEL_ID = 'plugins' as MainPanelId

/** Services required by the tab registration, the Remote methods, and the shared configuration forms. */
export const inject = [
  'slots', 'locale', 'remote', 'remote.pluginManager', 'remote.pluginInventory', 'remote.pluginRegistryProbe', 'configForms',
  'workbench',
]

declare module '@qilin-agent/kylin' {
  interface Context {
    /** Cross-plugin navigation to the Plugins management page. */
    pluginNavigation: {
      /**
       * Open a bundle's details without changing the current Session.
       * An absent bundle displays the plugin list after loading.
       * @param packageName - npm package name of the bundle.
       */
      openBundle(packageName: string): void
    }
  }
}

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

  // The open channel other surfaces call: the mounted page registers its
  // reveal action here, and an unclaimed channel still opens the section.
  let revealPackage: ((packageName: string) => void) | undefined
  const disposeNavigation = ctx.reflect.provide('pluginNavigation', {
    openBundle: (packageName: string) => {
      ctx.get('settingsShell')?.open('plugins')
      revealPackage?.(packageName)
    },
  } satisfies ClientContext['pluginNavigation'])
  ctx.effect(() => () => { void disposeNavigation() }, 'ui-plugin-manager: navigation channel')

  // One page, two seats: the sidebar entry opens it as a global main panel
  // (the profile's surface, not a Session's), and the Settings Plugins
  // section mounts the same page as its 管理 tab — the two stay consistent
  // because both render through this one controller face. The settings seat
  // shares the panel's child table (`rendersExistingChildren`) rather than
  // declaring its own: one slot, one declarer, and the page keeps its
  // `renderSlot` share in both places. What is installed and switched on is
  // the page's own; a plugin's configuration arrives through the slots the
  // page declares here, so the page never names a configurable plugin.
  const pageChildren = {
    'plugins.add.actions': { kind: 'list', scope: 'root' },
    'plugins.item': { kind: 'list', scope: 'root' },
    'plugins.bundle.activation': { kind: 'keyed', scope: 'root' },
    'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
    'plugins.row.config': { kind: 'keyed', scope: 'root' },
  } as const
  const configLedger = configLedgerSource(ctx)
  const face = controller.inject(configLedger, text => ctx.locale.resolveText(text))
  // The audience presentation gate: a bundle whose audience excludes the
  // active workbench renders as unregistered until the tag moves. It reads
  // this controller's package list, so the first read also arms the filter —
  // and the gate needs that read at boot, before the page is ever opened; a
  // read that fails before the connection settles re-runs on `connection/reset`.
  installAudienceGate(ctx, ctx.get('workbench') as Workbench, face.hooks.pluginManager)
  ctx.effect(() => {
    void controller.load()
    return () => {}
  }, 'ui-plugin-manager: gate boot read')
  // A failed manual refresh announces through the frame-wide overlay seat, so
  // the notice outlives the Settings tab it started in; the page's own toast
  // keeps every other notice kind.
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'plugin-manager.refresh-toast', locale: NS,
    inject: (): PluginRefreshToastFace => ({
      hooks: { pluginManager: face.hooks.pluginManager },
      dismissNotice: face.dismissNotice,
    }),
  }, PluginRefreshToast))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: () => face,
    children: pageChildren,
  }, PluginManagerPage))
  // First row of the sidebar's panel list, under the new-session button; the
  // schedules row (order 10) and later entries follow.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 0,
    locale: NS,
    label: () => t('panel'),
  }, PluginsPanelIcon))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: TAB_ID,
    order: 5,
    label: () => t('tab'),
    locale: NS,
    inject: () => ({
      ...face,
      registerOpen: (handler: (packageName: string) => void) => {
        revealPackage = handler
        return () => { if (revealPackage === handler) revealPackage = undefined }
      },
    }),
    children: pageChildren,
    rendersExistingChildren: true,
  }, PluginManagerPage))

}
