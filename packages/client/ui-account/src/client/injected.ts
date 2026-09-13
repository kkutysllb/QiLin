/**
 * The account menu's injected share: the browser reads and service calls the
 * component may make, taken from the plugin body's own context. Building the
 * face here keeps `apply` and the specs that drive the real status and
 * sign-out requests on one wiring.
 */
import type { BoundActions, HostObservable } from '@qilin/client-ui-slots'
import type { LocaleSnapshot } from '@qilin/client-locale/client'
import type { ThemeSnapshot } from '@qilin/client-ui-theme/client'
import { endSession, readAccountStatus } from './account-api.ts'
import type { AccountMenuInjected } from './AccountMenu.tsx'
import type { AccountMenuStoreHandle } from './store.ts'

/** Services and sources one account menu instance is wired to. */
export interface AccountMenuSources {
  /** Baked write set of the entry's own store instance. */
  readonly actions: BoundActions<AccountMenuStoreHandle>
  /** Reveal the settings panel. */
  readonly openSettings: () => void
  /** Switch the theme preference to a built-in id. */
  readonly setTheme: (id: string) => void
  /** Switch the active locale to a registered id. */
  readonly setLocale: (id: string) => void
  /** Live theme state; the renderer binds it as useTheme. */
  readonly theme: HostObservable<ThemeSnapshot>
  /** Live locale state; the renderer binds it as useLocale. */
  readonly locale: HostObservable<LocaleSnapshot>
  /** Live settings-panel presence; the renderer binds it as useSettingsPanel. */
  readonly settingsPanel: HostObservable<boolean>
}

/**
 * Build one entry's injected share.
 * @param sources - the store actions and service calls this instance routes to.
 * @returns the inject face the component receives.
 */
export function createAccountMenuInjected(sources: AccountMenuSources): AccountMenuInjected {
  return {
    loadAccount: async () => { sources.actions.resolveAccount(await readAccountStatus()) },
    // A refused sign-out navigates nowhere, so the menu keeps its state.
    signOut: async () => { await endSession() },
    openSettings: sources.openSettings,
    setTheme: sources.setTheme,
    setLocale: sources.setLocale,
    hooks: { theme: sources.theme, locale: sources.locale, settingsPanel: sources.settingsPanel },
  }
}
