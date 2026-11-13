/** The page store's write-outcome transitions. */
import { describe, expect, it } from 'vitest'
import { createTeamPageStore } from '../src/client/team-page-store.ts'

describe('createTeamPageStore', () => {
  it('starts idle without a notice', () => {
    const instance = createTeamPageStore().create()
    expect(instance.getSnapshot()).toEqual({ busy: false, notice: undefined })
  })

  it('records a write in flight, then its settlement', () => {
    const instance = createTeamPageStore().create()
    instance.actions.busy()
    expect(instance.getSnapshot()).toMatchObject({ busy: true, notice: undefined })
    instance.actions.settled()
    expect(instance.getSnapshot()).toEqual({ busy: false, notice: undefined })
  })

  it('carries the conflict notice across the refresh and lets the person dismiss it', () => {
    const instance = createTeamPageStore().create()
    instance.actions.busy()
    instance.actions.conflict()
    expect(instance.getSnapshot()).toEqual({ busy: false, notice: { kind: 'conflict' } })
    instance.actions.cleared()
    expect(instance.getSnapshot().notice).toBeUndefined()
  })

  it('carries a rejection diagnostic', () => {
    const instance = createTeamPageStore().create()
    instance.actions.rejected('subject must be non-empty')
    expect(instance.getSnapshot()).toEqual({
      busy: false,
      notice: { kind: 'rejected', message: 'subject must be non-empty' },
    })
  })

  it('replaces a standing notice when the next write starts', () => {
    const instance = createTeamPageStore().create()
    instance.actions.rejected('nope')
    instance.actions.busy()
    expect(instance.getSnapshot().notice).toBeUndefined()
  })
})
