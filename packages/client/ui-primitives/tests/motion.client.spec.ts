// @vitest-environment jsdom
/** One reduced-motion answer gates every animation the package starts. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion } from '../src/motion.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('prefersReducedMotion', () => {
  it('reports the platform preference', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(prefersReducedMotion()).toBe(true)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(prefersReducedMotion()).toBe(false)
  })

  it('allows motion on a platform that implements no matcher', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(prefersReducedMotion()).toBe(false)
  })
})
