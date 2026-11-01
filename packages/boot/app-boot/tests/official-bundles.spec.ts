/** The offline catalog does not depend on installed provider packages or registry requests. */

import { describe, expect, it } from 'vitest'
import { OFFICIAL_ON_DEMAND_CATALOG, ON_DEMAND_BUNDLES } from '../src/official-bundles.ts'

describe('Official on-demand catalog', () => {
  it('carries one generated entry per admitted on-demand bundle', () => {
    expect(OFFICIAL_ON_DEMAND_CATALOG.map(entry => entry.packageName)).toEqual([...ON_DEMAND_BUNDLES])
  })

  it('advertises no on-demand bundle until one is admitted', () => {
    expect(ON_DEMAND_BUNDLES).toEqual([])
    expect(OFFICIAL_ON_DEMAND_CATALOG).toEqual([])
  })
})
