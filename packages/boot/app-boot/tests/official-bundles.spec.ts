/** The offline catalog does not depend on installed provider packages or registry requests. */

import { describe, expect, it } from 'vitest'
import type { LocalizedText } from '@qilin-agent/package-manifest'
import { OFFICIAL_ON_DEMAND_CATALOG, ON_DEMAND_BUNDLES } from '../src/official-bundles.ts'

/** Both locales carry text whether the package shipped a plain string or a locale map. */
function bothLocales(text: LocalizedText): string[] {
  return typeof text === 'string' ? [text, text] : [text.en, text.zh ?? '']
}

describe('Official on-demand catalog', () => {
  it('advertises the two native subagent backends the Plugins page installs on demand', () => {
    expect(ON_DEMAND_BUNDLES).toEqual([
      '@qilin-agent/subagent-claude-code',
      '@qilin-agent/subagent-codex',
    ])
    expect(OFFICIAL_ON_DEMAND_CATALOG.map(entry => entry.packageName)).toEqual([...ON_DEMAND_BUNDLES])
    for (const entry of OFFICIAL_ON_DEMAND_CATALOG) {
      expect(bothLocales(entry.meta.title).every(text => text !== '')).toBe(true)
      expect(bothLocales(entry.meta.description).every(text => text !== '')).toBe(true)
      expect(entry.meta.icon).toMatch(/^data:image\/svg\+xml;base64,/)
    }
  })
})
