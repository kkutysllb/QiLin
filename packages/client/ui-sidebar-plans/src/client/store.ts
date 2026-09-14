/**
 * The plan panel's view state: what each tab last scanned.
 *
 * A scan per tab is state the type owns, so it lives in a Slot-standard
 * exclusive store (one instance per session), bucketed by tab id because two
 * tabs of this kind scan independently. Keeping it here is also what makes a
 * tab switch cheap: the body unmounts and remounts while its record lives, and
 * the list it already scanned is still in its bucket.
 *
 * Writers run between `scanning` and `forget`, and the face stops dispatching
 * once the record's signal aborts.
 */
import { defineStore, type EngineStoreHandle } from '@qilin/client-store'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { PlanRow } from './plans.ts'

/** What one tab last scanned. */
export interface PlansTabState {
  /** The rows the last settled scan produced, in the convention's order; empty until one settles. */
  readonly rows: readonly PlanRow[]
  /** Whether a scan is in flight. */
  readonly scanning: boolean
  /** Why the last settled scan could not be trusted; absent while there is nothing to report. */
  readonly failure?: RemoteFailure
}

/** Every tab's plan list, keyed by tab id. */
export interface PlansState {
  byTab: Record<TabId, PlansTabState>
}

/** The panel store's write set; every action names the tab it writes. */
type PlansActions = {
  scanning: (draft: PlansState, tabId: TabId) => void
  settled: (draft: PlansState, tabId: TabId, rows: readonly PlanRow[], failure: RemoteFailure | undefined) => void
  forget: (draft: PlansState, tabId: TabId) => void
}

/**
 * Declare the plan panel's store.
 *
 * A factory rather than a shared handle: the registration declares it as an
 * exclusive store, so the framework mints one instance per session.
 * @returns the store handle to declare on the registration.
 */
export function createPlansStore(): EngineStoreHandle<PlansState, PlansActions> {
  return defineStore({
    init: (): PlansState => ({ byTab: {} }),
    actions: {
      /**
       * Mark one tab as scanning, keeping the rows it already holds.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      scanning: (d, tabId) => {
        const held = d.byTab[tabId]
        d.byTab[tabId] = held === undefined
          ? { rows: [], scanning: true }
          : { ...held, scanning: true }
      },
      /**
       * Record what one scan settled on.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param rows - the rows the scan produced.
       * @param failure - why the scan could not be trusted, or `undefined`.
       */
      settled: (d, tabId, rows, failure) => {
        d.byTab[tabId] = failure === undefined
          ? { rows, scanning: false }
          : { rows, scanning: false, failure }
      },
      /**
       * Forget one tab's list, for a tab record that is gone.
       * @param d - draft state.
       * @param tabId - the tab that went away.
       */
      forget: (d, tabId) => {
        d.byTab = Object.fromEntries(Object.entries(d.byTab).filter(([id]) => id !== tabId))
      },
    },
  })
}
