/**
 * Settings shell contract — the types of the `sidebar.settings` occupant this
 * package renders. They live here rather than in ui-settings because they
 * reference the sidebar's own slot type: ui-settings is the settings domain's
 * base layer and must not depend on any `ui-*` presentation package, or the
 * reference graph closes a cycle through ui-sidebar → ui-layout → ui-theme.
 * The settings SLOT types (what registrants contribute) stay in ui-settings.
 */
import type { ConnectionState } from '@qilin/client-connection/client'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime,
} from '@qilin/client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.settings' entry)
// into every program that sees this contract.
import type {} from '@qilin/client-ui-sidebar/client'
// Type-only: pulls the settings slot declarations the shell renders into.
import type {} from '@qilin/client-ui-settings/client'

/** One nav row projected from a settings.section registration's options. */
export interface SettingsSectionRow {
  id: string
  order: number
  label: string
}

/** One ordered onboarding step projected from a slot registration. */
export interface SettingsOnboardingStep {
  id: string
  order: number
}

/**
 * The settings panel's open channel, provided as `ctx.settingsShell` so a
 * surface outside this package can reveal the panel (the account menu's own
 * Settings row). The panel state stays with the shell occupant; this service
 * only carries the request, and it is inert until that occupant mounts.
 */
export interface SettingsShell {
  /**
   * Reveal the settings panel, optionally selecting one section.
   * @param sectionId - section to select; omitted keeps the current selection.
   */
  open(sectionId?: string): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    settingsShell: SettingsShell
  }
}

/**
 * Registrant-private injected share of the settings shell (assembled in
 * apply): connection state and ledger projections arrive as hook-compartment
 * sources, while the reconnect command and the open-channel registration
 * remain plain callbacks.
 */
export type SettingsRootInjected = {
  /** Request a fresh logical generation and physical WebSocket immediately. */
  reconnect: () => void
  /**
   * Hand the shell occupant's own reveal action to {@link SettingsShell}.
   * @param handler - invoked with the requested section id.
   * @returns the disposer releasing the channel.
   */
  registerOpen: (handler: (sectionId?: string) => void) => () => void
  hooks: {
    /** Connection-owned state for the current Host connection. */
    connectionState: HostObservable<ConnectionState | undefined>
    /** settings.section ledger projected into ordered nav rows. */
    sections: HostObservable<readonly SettingsSectionRow[]>
    /** settings.onboarding ledger projected into coordinator order. */
    onboardingSteps: HostObservable<readonly SettingsOnboardingStep[]>
  }
}

/**
 * Full component props of the settings shell root: the sidebar owner share
 * (wide/rail state) plus the declared render shares and the injected face
 * (hooks compartment bound to useSections). No store is registered — modal
 * open state and active section id are component-local viewing state.
 */
export type SettingsRootComponentProps =
  PropsRuntime<'sidebar.settings'>
  & PropsRenderSlots<
    | 'settings.trigger'
    | 'settings.header'
    | 'settings.action'
    | 'settings.close'
    | 'settings.section'
    | 'settings.onboarding'
  >
  & InjectFace<SettingsRootInjected>
  & PropsLocale<'settings'>
