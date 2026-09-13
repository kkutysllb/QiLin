/**
 * Account menu plugin, browser half: the sidebar footer's account button and
 * its menu — the one surface that switches theme and language, opens Settings,
 * and signs out. It joins the sidebar's footer action list, reads the account
 * gate's status itself, and owns no other state.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@qilin/client-ui-slots'
// Type-only: pulls the ctx.locale merge (the language rows and their writes).
import type {} from '@qilin/client-locale/client'
// Type-only: pulls the ctx.theme merge (the theme rows and their writes).
import type {} from '@qilin/client-ui-theme/client'
// Type-only: pulls the ctx.settingsShell merge (the panel's open channel).
import type {} from '@qilin/client-ui-settings-general/client'
// Type-only: pulls the SlotRegistry service merge and the sidebar's own
// 'sidebar.footer.action' declaration. Cross-plugin collaboration goes through
// services and slots, never a value import (client bundle purity gate).
import type {} from '@qilin/client-ui-sidebar/client'
import type {} from '@qilin/client-ui-renderer/client'
import { AccountMenu } from './AccountMenu.tsx'
import type { AccountMenuInjected } from './AccountMenu.tsx'
import { createAccountMenuInjected } from './injected.ts'
import { SettingsPanelPresence } from './settings-panel.ts'
import { createAccountMenuStore } from './store.ts'
import type { AccountMenuStoreHandle } from './store.ts'
import { en, zh, type AccountLocaleKey } from './locales.ts'

export type { AccountMenuInjected, AccountMenuProps } from './AccountMenu.tsx'
export type { AccountFacts, AccountStatus, AccountUser } from './account-api.ts'
export type { AccountMenuActions, AccountMenuState, AccountMenuStoreHandle } from './store.ts'
export type { AccountLocaleKey } from './locales.ts'

declare module '@qilin/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar account menu copy. */
    account: AccountLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'account'

/** Services required by the account menu: the slot it fills and the two
 * preference services behind its rows. The settings panel is an optional
 * neighbour — see the scoped injection in {@link apply}. */
export const inject = ['slots', 'locale', 'theme']

/**
 * Register the account menu into the sidebar footer, once the sidebar declares
 * that list, and hand it the one store its entry shares.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-account: dictionaries')
  const store = createAccountMenuStore()
  const settingsPanel = new SettingsPanelPresence()
  const injected = (actions: BoundActions<AccountMenuStoreHandle>): AccountMenuInjected =>
    createAccountMenuInjected({
      actions,
      openSettings: () => { ctx.get('settingsShell')?.open() },
      setTheme: (id) => { ctx.theme.setTheme(id) },
      setLocale: (id) => { ctx.locale.setLocale(id) },
      theme: {
        getSnapshot: () => ctx.theme.getTheme(),
        subscribe: listener => ctx.on('theme/change', listener),
      },
      locale: {
        getSnapshot: () => ctx.locale.getSnapshot(),
        subscribe: listener => ctx.locale.subscribe(listener),
      },
      settingsPanel: settingsPanel.mounted,
    })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'account',
    order: 0,
    locale: NS,
    store,
    inject: injected,
  }, AccountMenu))
  // The settings panel owns the Settings row's destination and a deployment may
  // omit it — a fixture surface that serves no settings traffic mounts this menu
  // without the shell. Waiting for the service would leave the entry unactivated
  // in that composition, so the row follows the service instead: it appears
  // while the panel is mounted and disappears with it.
  ctx.inject(['settingsShell'], (scope: ClientContext) => {
    scope.effect(() => {
      settingsPanel.publish(true)
      return () => { settingsPanel.publish(false) }
    }, 'ui-account: settings row availability')
  })
}
