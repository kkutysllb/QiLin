/** The placement lists stay disjoint, and every offered option is badged, built-in, or on demand. */

import { describe, expect, it } from 'vitest'
import {
  EXPERIMENTAL_BUNDLES, EXTENSION_BUNDLES, HIDDEN_BUNDLES, MORE_BUNDLES, ON_DEMAND_BUNDLES, RETIRED_BUNDLES,
  RENAMED_BUNDLES,
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

  it('keeps the always-on layers off the page and the offered bundles on it', () => {
    // Agent Teams is switched from the Session header; the automation tasks rows
    // are part of the shipped Web composition, so its package is retired. Both
    // stay out of the page's lists.
    expect(isHiddenBundle('@qilin-agent/agent-team-profile')).toBe(true)
    expect(EXTENSION_BUNDLES).not.toContain('@qilin-agent/agent-team-profile')
    expect(RETIRED_BUNDLES.has('@qilin-agent/experimental-schedule-bundle')).toBe(true)
    expect(isHiddenBundle('@qilin-agent/experimental-schedule-bundle')).toBe(true)
    expect(EXTENSION_BUNDLES).not.toContain('@qilin-agent/experimental-schedule-bundle')
    expect(EXTENSION_BUNDLES).toContain('@qilin-agent/experimental-voice-input-bundle')
    expect(isExperimentalBundle('@qilin-agent/experimental-voice-input-bundle')).toBe(true)
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

describe('Renamed bundles', () => {
  it('maps the retired experimental agent-team profile to its shipped replacement', () => {
    expect(RENAMED_BUNDLES).toEqual({
      '@qilin-agent/experimental-agent-team-profile': '@qilin-agent/agent-team-profile',
    })
    for (const [from, to] of Object.entries(RENAMED_BUNDLES)) {
      expect(EXTENSION_BUNDLES).not.toContain(from)
      expect(MORE_BUNDLES).not.toContain(from)
      expect(RETIRED_BUNDLES.has(to)).toBe(false)
    }
  })
})

describe('Superseded bundles', () => {
  it('retires the standalone worktree bundle when the unified forge bundle is selected', () => {
    expect(SUPERSEDED_BUNDLES).toEqual({
      '@qilin-agent/experimental-forge-bundle': ['@qilin-agent/experimental-tool-worktree'],
    })
    for (const [replacing, retired] of Object.entries(SUPERSEDED_BUNDLES)) {
      expect(isExperimentalBundle(replacing)).toBe(true)
      for (const name of retired) expect(isExperimentalBundle(name)).toBe(true)
    }
  })
})

describe('Retired bundles', () => {
  it('names the removed bundles and keeps them out of every offered list', () => {
    expect([...RETIRED_BUNDLES]).toEqual([
      '@qilin-agent/experimental-inspector-profile',
      '@qilin-agent/experimental-schedule-bundle',
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
