/** The placement lists stay disjoint, and every offered option is experimental or on demand. */

import { describe, expect, it } from 'vitest'
import {
  EXPERIMENTAL_BUNDLES, EXTENSION_BUNDLES, HIDDEN_BUNDLES, MORE_BUNDLES, ON_DEMAND_BUNDLES,
  isExperimentalBundle, isHiddenBundle, isOnDemandBundle,
} from '../src/index.ts'

describe('Plugins page placement lists', () => {
  it('ranks every offered option once', () => {
    const offered = [...EXTENSION_BUNDLES, ...MORE_BUNDLES]
    expect(new Set(offered).size).toBe(offered.length)
    expect(new Set(EXTENSION_BUNDLES).size).toBe(EXTENSION_BUNDLES.length)
    expect(new Set(MORE_BUNDLES).size).toBe(MORE_BUNDLES.length)
  })

  it('marks every offered option experimental or on demand', () => {
    for (const name of [...EXTENSION_BUNDLES, ...MORE_BUNDLES]) {
      expect(isExperimentalBundle(name) || isOnDemandBundle(name)).toBe(true)
    }
  })

  it('keeps the built-in profile layers out of every offered list', () => {
    for (const name of HIDDEN_BUNDLES) {
      expect(isHiddenBundle(name)).toBe(true)
      expect(EXTENSION_BUNDLES).not.toContain(name)
      expect(MORE_BUNDLES).not.toContain(name)
      expect(EXPERIMENTAL_BUNDLES).not.toContain(name)
    }
  })
})

describe('Official on-demand admission', () => {
  it('offers no on-demand bundle, so no page holds an on-demand affordance', () => {
    expect(ON_DEMAND_BUNDLES).toEqual([])
    for (const name of [...EXTENSION_BUNDLES, ...MORE_BUNDLES, ...HIDDEN_BUNDLES]) expect(isOnDemandBundle(name)).toBe(false)
  })
})

describe('Experimental badge', () => {
  it('reads the admitted list rather than the package name prefix', () => {
    expect(isExperimentalBundle('@qilin-agent/experimental-ralph-bundle')).toBe(true)
    expect(isExperimentalBundle('@qilin-agent/web-app')).toBe(false)
    expect(isExperimentalBundle('@qilin-agent/experimental-not-an-admitted-bundle')).toBe(false)
    expect(EXPERIMENTAL_BUNDLES.size).toBeGreaterThan(0)
  })
})
