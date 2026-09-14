/**
 * The panel's write set, one tab at a time.
 *
 * Two facts here are load-bearing for the body: a new scan keeps the rows a
 * tab already holds (the poll must not blank the list), and `forget` removes
 * exactly the tab whose record went away.
 */
import { describe, expect, it } from 'vitest'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { PlanRow } from '../src/client/plans.ts'
import { RemoteError } from '@qilin/client-test-runtime'
import { createPlansStore } from '../src/client/store.ts'

const TAB = 'tab-1' as TabId

const ROWS: readonly PlanRow[] = [
  { path: '/work/app/plan.md', base: 'plan.md', rel: 'plan.md', title: 'Workspace plan' },
]

describe('createPlansStore', () => {
  it('mints an independent instance per call', () => {
    const first = createPlansStore().create()
    const second = createPlansStore().create()
    first.actions.scanning(TAB)
    expect(second.getSnapshot().byTab[TAB]).toBeUndefined()
  })

  it('seeds a tab on its first scan and keeps its rows across the next one', () => {
    const store = createPlansStore().create()
    store.actions.scanning(TAB)
    expect(store.getSnapshot().byTab[TAB]).toEqual({ rows: [], scanning: true })
    store.actions.settled(TAB, ROWS, undefined)
    expect(store.getSnapshot().byTab[TAB]).toEqual({ rows: ROWS, scanning: false })
    store.actions.scanning(TAB)
    expect(store.getSnapshot().byTab[TAB]).toEqual({ rows: ROWS, scanning: true })
  })

  it('keeps a failure until a scan settles without one', () => {
    const store = createPlansStore().create()
    const failure: RemoteFailure = new RemoteError('gateway/internal', 'socket closed', {})
    store.actions.settled(TAB, ROWS, failure)
    expect(store.getSnapshot().byTab[TAB]).toEqual({ rows: ROWS, scanning: false, failure })
    store.actions.settled(TAB, [], undefined)
    expect(store.getSnapshot().byTab[TAB]).toEqual({ rows: [], scanning: false })
  })

  it('forget removes exactly the tab that went away', () => {
    const store = createPlansStore().create()
    store.actions.scanning(TAB)
    store.actions.scanning('tab-2' as TabId)
    store.actions.forget(TAB)
    expect(Object.keys(store.getSnapshot().byTab)).toEqual(['tab-2'])
  })
})
