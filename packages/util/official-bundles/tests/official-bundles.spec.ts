/** The placement lists stay disjoint, and every offered option is badged, built-in, or on demand. */

import { describe, expect, it } from 'vitest'
import {
  EXPERIMENTAL_BUNDLES, EXTENSION_BUNDLES, HIDDEN_BUNDLES, MORE_BUNDLES, ON_DEMAND_BUNDLES, RETIRED_BUNDLES,
  SUPERSEDED_BUNDLES,
  isExperimentalBundle, isHiddenBundle, isOnDemandBundle,
} from '../src/index.ts'

describe('Plugins page placement lists', () => {
  it('ranks every offered option once', () => {
    const offered = [...EXTENSION_BUNDLES, ...MORE_BUNDLES]
    expect(new Set(offered).size).toBe(offered.length)
    expect(new Set(EXTENSION_BUNDLES).size).toBe(EXTENSION_BUNDLES.length)
    expect(new Set(MORE_BUNDLES).size).toBe(MORE_BUNDLES.length)
  })

  it('places every offered option: an Experimental badge, a built-in main-list entry, or on demand', () => {
    for (const name of MORE_BUNDLES) expect(isExperimentalBundle(name)).toBe(true)
    for (const name of EXTENSION_BUNDLES) {
      expect(isExperimentalBundle(name) || isOnDemandBundle(name) || EXTENSION_BUNDLES.includes(name)).toBe(true)
    }
  })

  it('keeps the promoted Agent Teams and Schedule bundles off the Experimental badge', () => {
    for (const name of ['@qilin-agent/experimental-agent-team-profile', '@qilin-agent/experimental-schedule-bundle']) {
      expect(EXTENSION_BUNDLES).toContain(name)
      expect(isExperimentalBundle(name)).toBe(false)
    }
    // Schedule follows Agent Teams on the main list, which is the order the page renders.
    expect(EXTENSION_BUNDLES.indexOf('@qilin-agent/experimental-schedule-bundle'))
      .toBe(EXTENSION_BUNDLES.indexOf('@qilin-agent/experimental-agent-team-profile') + 1)
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

describe('Superseded bundles', () => {
  it('retires the standalone worktree bundle when the unified forge bundle is selected', () => {
    expect(SUPERSEDED_BUNDLES).toEqual({
      '@qilin-agent/experimental-forge-bundle': ['@qilin-agent/experimental-tool-worktree'],
    })
    for (const [replacing, retired] of Object.entries(SUPERSEDED_BUNDLES)) {
      expect(isExperimentalBundle(replacing)).toBe(true)
      // A superseded bundle is no longer offered: hidden from the page, retired at profile load.
      for (const name of retired) {
        expect(isHiddenBundle(name)).toBe(true)
        expect(RETIRED_BUNDLES.has(name)).toBe(true)
      }
    }
  })
})

describe('Retired bundles', () => {
  it('names the removed Developer Tools bundle and keeps it out of every offered list', () => {
    expect([...RETIRED_BUNDLES]).toEqual([
      '@qilin-agent/experimental-inspector-profile',
      // Merged into the forge bundle: the standalone worktree bundle retires at profile load.
      '@qilin-agent/experimental-tool-worktree',
    ])
    for (const name of RETIRED_BUNDLES) {
      expect(EXTENSION_BUNDLES).not.toContain(name)
      expect(MORE_BUNDLES).not.toContain(name)
      expect(isExperimentalBundle(name)).toBe(false)
      expect(isOnDemandBundle(name)).toBe(false)
    }
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
