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

/** Services required by the account menu: the slot it fills, the two
 * preference services behind its rows, and the settings panel's open channel. */
export const inject = ['slots', 'locale', 'theme', 'settingsShell']

/**
 * Register the account menu into the sidebar footer, once the sidebar declares
 * that list, and hand it the one store its entry shares.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-account: dictionaries')
  const store = createAccountMenuStore()
  const injected = (actions: BoundActions<AccountMenuStoreHandle>): AccountMenuInjected =>
    createAccountMenuInjected({
      actions,
      openSettings: () => { ctx.settingsShell.open() },
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
    })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'account',
    order: 0,
    locale: NS,
    store,
    inject: injected,
  }, AccountMenu))
}
