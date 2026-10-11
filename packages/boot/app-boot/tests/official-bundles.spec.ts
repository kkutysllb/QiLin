/** The offline catalog does not depend on installed provider packages or registry requests. */

import { describe, expect, it } from 'vitest'
import { OFFICIAL_ON_DEMAND_CATALOG, ON_DEMAND_BUNDLES } from '../src/official-bundles.ts'

describe('Official on-demand catalog', () => {
  it('advertises no provider after the Claude Code and Codex integrations left the product', () => {
    expect(ON_DEMAND_BUNDLES).toEqual([])
    expect(OFFICIAL_ON_DEMAND_CATALOG).toEqual([])
  })
})
