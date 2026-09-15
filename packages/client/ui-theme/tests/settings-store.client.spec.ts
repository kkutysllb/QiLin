/** Typography row store: snapshot-mirror actions and the revision guard. */
import { describe, expect, it } from 'vitest'
import { createTypographyRowStore } from '../src/client/settings-store.ts'

describe('createTypographyRowStore', () => {
  it('init shape: shipped size and leading with revision at -1', () => {
    const store = createTypographyRowStore().create()
    expect(store.getSnapshot()).toEqual({ fontSize: 14, leading: 0, revision: -1 })
  })

  it('sync mirrors both fields; the revision guard drops stale and duplicate writes', () => {
    const store = createTypographyRowStore().create()
    store.actions.sync(16, 2, 3)
    expect(store.getSnapshot()).toEqual({ fontSize: 16, leading: 2, revision: 3 })
    store.actions.sync(12, -2, 2)
    store.actions.sync(12, -2, 3)
    expect(store.getSnapshot().fontSize).toBe(16)
    expect(store.getSnapshot().leading).toBe(2)
    expect(store.getSnapshot().revision).toBe(3)
  })
})
