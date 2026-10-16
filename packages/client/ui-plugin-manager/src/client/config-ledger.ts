/**
 * Which plugins bring their own configuration to the Plugins page, read from
 * the two slots the page declares: the official plugins listed beside the
 * official bundles and the bundles with a form on their page. The projection
 * follows the slot ledgers and the active locale and keeps its snapshot until
 * one of them moves.
 */

import type { Context as ClientContext } from '@qilin-agent/kylin'
import { resolveSlotLabel, type HostObservable } from '@qilin-agent/client-ui-slots'
import type {} from './slot-contract.ts'

/** One official plugin as the page lists it: its registration id and its title in the active locale. */
export interface OfficialItem {
  readonly id: string
  readonly label: string
}

/**
 * The plugins carrying configuration: the official plugins in ledger order and
 * the package names of the bundles with a page-level form.
 */
export interface ConfigLedger {
  readonly items: readonly OfficialItem[]
  readonly bundles: ReadonlySet<string>
}

const SLOTS = ['plugins.item', 'plugins.bundle.config'] as const

/**
 * Project the configuration ledgers as one observable the page binds.
 * @param ctx - the page plugin's context, whose slot registry and locale the projection follows.
 * @returns the ledger source; its snapshot changes only when a ledger or the locale does.
 */
export function configLedgerSource(ctx: ClientContext): HostObservable<ConfigLedger> {
  let versions: readonly number[] = []
  let revision = -1
  let ledger: ConfigLedger = { items: [], bundles: new Set() }
  return {
    getSnapshot: () => {
      const next = SLOTS.map(name => ctx.slots.getVersion(name))
      const current = ctx.locale.getSnapshot().revision
      if (current !== revision || next.some((version, index) => version !== versions[index])) {
        versions = next
        revision = current
        ledger = {
          items: ctx.slots.entries('plugins.item').map(entry => ({
            /* v8 ignore next -- list-slot registration requires id */
            id: entry.options.id ?? '',
            label: resolveSlotLabel(entry.options.label) ?? '',
          })),
          bundles: new Set(ctx.slots.entries('plugins.bundle.config')
            .flatMap(entry => entry.options.key === undefined ? [] : [entry.options.key])),
        }
      }
      return ledger
    },
    subscribe: (listener) => {
      const offs = [...SLOTS.map(name => ctx.slots.subscribe(name, listener)), ctx.locale.subscribe(listener)]
      return () => { for (const off of offs) off() }
    },
  }
}
