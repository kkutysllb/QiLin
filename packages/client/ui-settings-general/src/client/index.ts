/**
 * Settings shell and ownerless-copy plugin, browser half: renders the
 * `sidebar.settings` occupant — panel chrome, section navigation, and the
 * onboarding stage — and registers everything on the Settings pages that
 * belongs to no single feature: the header/close chrome content, the General
 * and About sections, the desktop-update status, and `settings` dictionaries.
 * Feature-owned rows and sections stay with their features.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@qilin/kylin'
import type { ConnectionHandle } from '@qilin/client-connection/client'
import { resolveSlotLabel } from '@qilin/client-ui-slots'
// Type-only: the settings slot declarations. Cross-plugin collaboration goes
// through the service, never a value import (client bundle purity gate).
import type {} from '@qilin/client-ui-settings/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-ui-session/client'
import type {
  SettingsOnboardingStep, SettingsRootInjected, SettingsSectionRow, SettingsShell,
} from './shell-contract.ts'
import { SettingsRoot } from './SettingsRoot.tsx'
import { DesktopUpdateBadge } from './DesktopUpdateIndicator.tsx'
import type { DesktopUpdateBridge } from './desktop-update-bridge.ts'
import { DesktopUpdateSource } from './desktop-update-source.ts'
import { CloseLabel, HeaderContent, TriggerContent } from './chrome.tsx'
import { AboutSection } from './AboutSection.tsx'
import { GeneralSection } from './GeneralSection.tsx'
import { en, zh, type SettingsKey } from './locales.ts'

export type { SettingsShell, SettingsRootInjected } from './shell-contract.ts'
export type {
  CloseLabelProps, HeaderContentProps, TriggerContentProps,
} from './chrome.tsx'
export type {
  GeneralSectionComponentProps,
} from './GeneralSection.tsx'
export type { SettingsKey } from './locales.ts'

declare module '@qilin/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shell chrome + shell-owned General section copy. */
    settings: SettingsKey
  }
}

/** Dictionary namespace owned by this plugin (shell chrome + General copy). */
const NS = 'settings'

/**
 * Required services (cordis fiber inject). The target slots are declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registrations depend on their slots through `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the `settings` dictionaries, the chrome content, and the General
 * section, each once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-general: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle
  const carrier = (globalThis as typeof globalThis & {
    qilinDesktop?: { protocolVersion: number; updates?: DesktopUpdateBridge }
  }).qilinDesktop
  const desktopUpdate = new DesktopUpdateSource(carrier?.protocolVersion === 1 ? carrier.updates : undefined)
  ctx.effect(() => () => { desktopUpdate.dispose() }, 'ui-settings-general: desktop update carrier')
  ctx.slots.inject('sidebar.toggle.badge', () => ctx.slots.register({
    name: 'sidebar.toggle.badge', locale: NS,
    inject: () => ({ hooks: { desktopUpdate: desktopUpdate.store, connectionState: connection.state } }),
  }, DesktopUpdateBadge))

  // Copy freshness is framework-owned: components read the standard `t`
  // seat, and the nav label is a thunk the owner resolves per render — no
  // locale/change re-registration wiring.
  const t = ctx.locale.bind(NS)
  // The settings shell: this package occupies the sidebar-owned hole and
  // declares the settings slots. Ledger → nav-row projection as an observable
  // source (uSES contract: getSnapshot returns the cached rows until the
  // ledger version moves). Labels may be locale-following thunks, so the cache
  // key includes the locale revision and subscribers ride both sources.
  let rowsVersion = -1
  let rowsRevision = -1
  let rows: readonly SettingsSectionRow[] = []
  let onboardingVersion = -1
  let onboardingSteps: readonly SettingsOnboardingStep[] = []
  // The open channel other surfaces call: the shell occupant registers its own
  // reveal action here while it is mounted, and an unclaimed channel is a no-op.
  let revealPanel: ((sectionId?: string) => void) | undefined
  ctx.reflect.provide('settingsShell', {
    open: (sectionId?: string) => { revealPanel?.(sectionId) },
  } satisfies SettingsShell)
  const shellInjected = (): SettingsRootInjected => ({
    openDesktopUpdate: () => { desktopUpdate.open() },
    reconnect: () => { connection.reconnect() },
    registerOpen: (handler) => {
      revealPanel = handler
      return () => { revealPanel = undefined }
    },
    hooks: {
      desktopUpdate: desktopUpdate.store,
      connectionState: connection.state,
      sections: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.section')
          const revision = ctx.locale.getSnapshot().revision
          if (version !== rowsVersion || revision !== rowsRevision) {
            rowsVersion = version
            rowsRevision = revision
            // Winner cells, not the raw ledger: a section whose cell a lower-priority
            // entry shadowed renders nothing, so the nav must not list it either.
            rows = ctx.slots.entriesOfSlot('settings.section')
              .map(e => ({
                /* v8 ignore next -- list-slot registration requires id (SlotCore rejects an entry without one) */
                id: e.options.id ?? '',
                order: e.options.order ?? 0,
                label: resolveSlotLabel(e.options.label) ?? '',
              }))
              .sort((a, b) => a.order - b.order)
          }
          return rows
        },
        subscribe: (listener) => {
          const offLedger = ctx.slots.subscribe('settings.section', listener)
          const offLocale = ctx.locale.subscribe(listener)
          return () => {
            offLedger()
            offLocale()
          }
        },
      },
      onboardingSteps: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.onboarding')
          if (version !== onboardingVersion) {
            onboardingVersion = version
            // Same winner-cell projection as the section nav rows above.
            onboardingSteps = ctx.slots.entriesOfSlot('settings.onboarding')
              .map(e => ({
                /* v8 ignore next -- list-slot registration requires id */
                id: e.options.id ?? '',
                order: e.options.order ?? 0,
              }))
              .sort((a, b) => a.order - b.order)
          }
          return onboardingSteps
        },
        subscribe: listener => ctx.slots.subscribe('settings.onboarding', listener),
      },
    },
  })
  ctx.slots.inject('sidebar.settings', () => ctx.slots.register({
    name: 'sidebar.settings',
    locale: NS,
    children: {
      'settings.trigger': { kind: 'single', scope: 'root' },
      'settings.header': { kind: 'single', scope: 'root' },
      'settings.action': { kind: 'list', scope: 'root' },
      'settings.close': { kind: 'single', scope: 'root' },
      'settings.section': { kind: 'list', scope: 'root' },
      'settings.onboarding': { kind: 'list', scope: 'root' },
    },
    inject: shellInjected,
  }, SettingsRoot))

  ctx.slots.inject('settings.trigger', () =>
    ctx.slots.register({ name: 'settings.trigger', locale: NS }, TriggerContent))
  ctx.slots.inject('settings.header', () =>
    ctx.slots.register({ name: 'settings.header', locale: NS }, HeaderContent))
  ctx.slots.inject('settings.close', () =>
    ctx.slots.register({ name: 'settings.close', locale: NS }, CloseLabel))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'general',
    order: 0,
    label: () => t('general.nav'),
    locale: NS,
    children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
  }, GeneralSection))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'about',
    order: 10_000,
    label: () => t('about.nav'),
    locale: NS,
    children: { 'settings.about.mark': { kind: 'single', scope: 'root' } },
  }, AboutSection))
}
