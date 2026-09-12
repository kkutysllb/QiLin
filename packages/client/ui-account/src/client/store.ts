/**
 * Account menu store: whether the dropdown is open and what the status read
 * resolved about the signed-in account. The plugin body owns the reads and
 * publishes their results here; the component reads through props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@qilin/client-store'
import type { AccountFacts } from './account-api.ts'

/** What the account menu renders at any moment. */
export interface AccountMenuState {
  /** Whether the dropdown is showing. */
  open: boolean
  /** Signed-in email shown as the menu heading; null when none is known. */
  email: string | null
  /** Whether the menu offers the sign-out row. */
  signOutAvailable: boolean
}

/** Declared action shape giving the exported factory a stable return type. */
export type AccountMenuActions = {
  /** Open or close the dropdown. */
  setOpen: (draft: AccountMenuState, open: boolean) => void
  /** Publish what one status read resolved. */
  resolveAccount: (draft: AccountMenuState, facts: AccountFacts) => void
}

/** The declared handle one registration instance is created from. */
export type AccountMenuStoreHandle = EngineStoreHandle<AccountMenuState, AccountMenuActions>

/**
 * Declare the account menu state and write surface.
 * @returns a fresh handle — each registration instance owns its own open state
 * and account facts, so no module-level handle can leak across plugin reloads.
 */
export function createAccountMenuStore(): AccountMenuStoreHandle {
  return defineStore({
    init: (): AccountMenuState => ({ open: false, email: null, signOutAvailable: false }),
    actions: {
      setOpen: (draft, open: boolean) => { draft.open = open },
      resolveAccount: (draft, facts: AccountFacts) => {
        draft.email = facts.email
        draft.signOutAvailable = facts.signOutAvailable
      },
    },
  })
}
