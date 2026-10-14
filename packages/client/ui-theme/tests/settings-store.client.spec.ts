/** Font row store: snapshot-mirror actions and the revision guard. */
import { describe, expect, it } from 'vitest'
import { createFontRowStore } from '../src/client/settings-store.ts'
import { DEFAULT_FONT_SIZES } from '../src/theme-settings.ts'

describe('createFontRowStore', () => {
  it('init shape: shipped defaults with revision at -1', () => {
    const store = createFontRowStore().create()
    expect(store.getSnapshot()).toEqual({
      fontSizes: DEFAULT_FONT_SIZES, fontFamilies: { text: '', code: '', terminal: '' }, revision: -1,
    })
  })

  it('sync mirrors sizes and families; the revision guard drops stale and duplicate writes', () => {
    const store = createFontRowStore().create()
    store.actions.sync({ text: 16, code: 12, terminal: 14 }, { text: '"Inter"', code: '', terminal: '' }, 3)
    expect(store.getSnapshot()).toEqual({
      fontSizes: { text: 16, code: 12, terminal: 14 },
      fontFamilies: { text: '"Inter"', code: '', terminal: '' },
      revision: 3,
    })
    store.actions.sync({ text: 12, code: 11, terminal: 13 }, { text: '', code: '', terminal: '' }, 2)
    store.actions.sync({ text: 12, code: 11, terminal: 13 }, { text: '', code: '', terminal: '' }, 3)
    expect(store.getSnapshot().fontSizes.text).toBe(16)
    expect(store.getSnapshot().revision).toBe(3)
  })
})
