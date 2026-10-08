/**
 * Settings shell and ownerless-copy plugin, browser half: renders the
 * `sidebar.settings` occupant — panel chrome, section navigation, and the
 * onboarding stage — and registers everything on the Settings pages that
 * belongs to no single feature: the header/close chrome content, the General
 * and About sections, and `settings` dictionaries.
 * Feature-owned rows and sections stay with their features.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@qilin-agent/kylin'
import type { ConnectionHandle } from '@qilin-agent/client-connection/client'
import { resolveSlotLabel } from '@qilin-agent/client-ui-slots'
import { closeTopModal } from '@qilin-agent/client-ui-primitives'
// Type-only: the settings slot declarations. Cross-plugin collaboration goes
// through the service, never a value import (client bundle purity gate).
import type {} from '@qilin-agent/client-ui-settings/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@qilin-agent/client-locale/client'
import type { ShortcutCommandId } from '@qilin-agent/client-shortcuts/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
import type {} from '@qilin-agent/client-ui-session/client'
import type {
  SettingsOnboardingStep, SettingsRootInjected, SettingsSectionRow, SettingsShell,
} from './shell-contract.ts'
import { createSettingsShellStore } from './shell-store.ts'
import { SettingsRoot } from './SettingsRoot.tsx'
import { CloseLabel, HeaderContent } from './chrome.tsx'
import { AboutSection } from './AboutSection.tsx'
import { GeneralSection } from './GeneralSection.tsx'
import { CurrentVersionRow } from './CurrentVersionRow.tsx'
import { DeveloperToolsRow, type DeveloperToolsRowInjected } from './DeveloperToolsRow.tsx'
import { SettingsDocumentAction, type SettingsDocumentActionInjected } from './SettingsDocumentAction.tsx'
import { SettingsDocumentStore } from './settings-document-store.ts'
import { en, zh, type SettingsKey } from './locales.ts'

export type { SettingsShell, SettingsRootInjected } from './shell-contract.ts'
export type {
  CloseLabelProps, HeaderContentProps,
} from './chrome.tsx'
export type {
  GeneralSectionComponentProps,
} from './GeneralSection.tsx'
export type { DeveloperToolsRowInjected } from './DeveloperToolsRow.tsx'
export type { SettingsDocumentActionInjected, SettingsDocumentActionProps } from './SettingsDocumentAction.tsx'
export type { SettingsDocumentState } from './settings-document-store.ts'
export { SettingsDocumentStore } from './settings-document-store.ts'
export type { SettingsKey } from './locales.ts'

declare module '@qilin-agent/client-ui-slots' {
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
 * `configForms` serves the local-document availability mirror and the
 * shared coding-tools preference.
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.settings', 'configForms', 'shortcuts']

/**
 * Register the `settings` dictionaries, the chrome content, and the General
 * section, each once its slot declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'developer-tools', order: 15, locale: NS,
    inject: (): DeveloperToolsRowInjected => ({
      hooks: { developerTools: ctx.configForms.developerTools.enabled },
      setEnabled: enabled => ctx.configForms.developerTools.setEnabled(enabled),
    }),
  }, DeveloperToolsRow))
  // Version information follows the core preferences.
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item', id: 'current-version', order: 100, locale: NS,
  }, CurrentVersionRow))
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-general: dictionaries')
  const connection = ctx.get('connection') as ConnectionHandle

  // The shared ConfigForm mirror updates after document commits and reconnects.
  const documentController = ctx.remote.$host.isLoopback
    ? new SettingsDocumentStore(ctx, ctx.configForms.describe())
    : undefined
  ctx.effect(() => () => { documentController?.dispose() }, 'ui-settings-general: document action directory')
  if (documentController !== undefined) {
    const documentInjected = (): SettingsDocumentActionInjected => ({
      controller: documentController,
      hooks: { snapshot: documentController.store },
    })
    ctx.slots.inject('settings.action', () => ctx.slots.register({
      name: 'settings.action',
      id: 'open-document',
      order: 0,
      locale: NS,
      inject: documentInjected,
    }, SettingsDocumentAction))
  }

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
  let rowsAdmission = -1
  let rows: readonly SettingsSectionRow[] = []
  let onboardingVersion = -1
  let onboardingAdmission = -1
  let onboardingSteps: readonly SettingsOnboardingStep[] = []
  // The open channel other surfaces call: the shell occupant registers its own
  // reveal action here while it is mounted, and an unclaimed channel is a no-op.
  let revealPanel: ((sectionId?: string) => void) | undefined
  ctx.reflect.provide('settingsShell', {
    open: (sectionId?: string) => { revealPanel?.(sectionId) },
  } satisfies SettingsShell)
  const shellInjected = (): SettingsRootInjected => ({
    reconnect: () => { connection.reconnect() },
    registerOpen: (handler) => {
      revealPanel = handler
      return () => { revealPanel = undefined }
    },
    hooks: {
      connectionState: connection.state,
      sections: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.section')
          const revision = ctx.locale.getSnapshot().revision
          const admission = ctx.slots.admission().getSnapshot()
          if (version !== rowsVersion || revision !== rowsRevision || admission !== rowsAdmission) {
            rowsVersion = version
            rowsRevision = revision
            rowsAdmission = admission
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
          const offAdmission = ctx.slots.admission().subscribe(listener)
          return () => {
            offLedger()
            offLocale()
            offAdmission()
          }
        },
      },
      onboardingSteps: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.onboarding')
          const admission = ctx.slots.admission().getSnapshot()
          if (version !== onboardingVersion || admission !== onboardingAdmission) {
            onboardingVersion = version
            onboardingAdmission = admission
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
        subscribe: (listener) => {
          const offLedger = ctx.slots.subscribe('settings.onboarding', listener)
          const offAdmission = ctx.slots.admission().subscribe(listener)
          return () => {
            offLedger()
            offAdmission()
          }
        },
      },
    },
  })
  ctx.slots.inject('sidebar.settings', () => {
    const shellHandle = createSettingsShellStore()
    const shellInstance = shellHandle.create()
    const shellStore: typeof shellHandle = { ...shellHandle, create: () => shellInstance }
    const disposeCommand = ctx.shortcuts.register({
      id: 'settings.open' as ShortcutCommandId, label: () => t('shortcut.open'), aliases: ['settings', 'preferences'],
      defaults: {
        'desktop:macos': { code: 'Comma', modifiers: ['primary'] },
        'desktop:windows': { code: 'Comma', modifiers: ['primary'] },
        'desktop:linux': { code: 'Comma', modifiers: ['primary'] },
        'web:macos': { code: 'Comma', modifiers: ['primary'] },
        'web:windows': { code: 'Comma', modifiers: ['primary'] },
      },
      regions: ['page', 'editable', 'terminal'], modals: ['settings'],
      resolve: ({ modal }) => {
        if (modal !== null && modal !== 'settings') return { status: 'blocked', reason: 'modal' }
        return { status: 'handled', run: () => {
          if (modal === 'settings') closeTopModal(document)
          else shellInstance.actions.open()
        } }
      },
    })
    const disposeSlot = ctx.slots.register({
      name: 'sidebar.settings',
      locale: NS,
      store: shellStore,
      children: {
        'settings.header': { kind: 'single', scope: 'root' },
        'settings.action': { kind: 'list', scope: 'root' },
        'settings.close': { kind: 'single', scope: 'root' },
        'settings.section': { kind: 'list', scope: 'root' },
        'settings.onboarding': { kind: 'list', scope: 'root' },
      },
      inject: shellInjected,
    }, SettingsRoot)
    return () => { disposeCommand(); disposeSlot() }
  })

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
