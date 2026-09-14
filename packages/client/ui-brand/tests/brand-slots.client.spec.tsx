// @vitest-environment jsdom
/**
 * The QiLin brand plugin must occupy exactly the brand-mark slots it
 * declares, wait for every declaration, and release every occupant when its
 * fiber unloads.
 */

import { Context } from '@qilin/kylin'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SlotRegistry } from '@qilin/client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { QilinSealArtist, QilinSealHeroMark, QilinSealMark } from '../src/client/Seal.tsx'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => { cleanup() })

const HOLES = [
  'sidebar.brand.mark',
  'conversation.hero.brand.mark',
  'settings.about.mark',
] as const

/**
 * Build a slot runtime with every brand hole a surface owner declares.
 * @param declare - whether the holes exist before the plugin mounts.
 * @returns the context, its registry, and the declaration control.
 */
async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const declareHoles = () => slots.register({
    name: 'root',
    children: Object.fromEntries(HOLES.map(name => [name, { kind: 'single', scope: 'root' }])),
  } as never, () => null)
  const disposeHoles = declare ? declareHoles() : undefined
  return { ctx, slots, declareHoles, disposeHoles }
}

describe('qilin brand plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the slot service it uses', () => {
    expect(inject).toEqual(['slots'])
  })

  it('renders the seal as a cinnabar body with a gold ring and both glyph outlines', () => {
    const { container } = render(<QilinSealArtist size={24} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    // The cinnabar body and the gold hairline ring.
    expect(container.querySelectorAll('rect')).toHaveLength(2)
    expect(container.querySelector('rect')?.getAttribute('fill')).toMatch(/^url\(#qilin-seal-body-/u)
    expect(container.querySelectorAll('stop')).toHaveLength(3)
    const glyphs = [...container.querySelectorAll('path')]
    expect(glyphs).toHaveLength(2)
    for (const glyph of glyphs) {
      expect(glyph.getAttribute('d')?.length ?? 0).toBeGreaterThan(1000)
      expect(glyph.getAttribute('fill')).toBe('#fff5eb')
      expect(glyph.getAttribute('transform')).toContain('scale(')
    }
  })

  it('gives concurrent seals their own body gradient', () => {
    const { container } = render(<><QilinSealArtist size={24} /><QilinSealArtist size={24} /></>)
    const fills = [...container.querySelectorAll('rect')].map(rect => rect.getAttribute('fill'))
    expect(fills[0]).not.toBe(fills[2])
  })

  it('renders the sidebar occupant at the requested size', () => {
    const { container } = render(<QilinSealMark size={18} />)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('18')
  })

  it('renders the hero occupant at the requested size and placement class', () => {
    const { container } = render(<QilinSealHeroMark size={40} className="hero-mark" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('40')
    expect(svg?.getAttribute('class')).toBe('hero-mark')
  })

  it('fills every hole and removes every occupant on teardown', async () => {
    const before = await bench()
    const fiber = before.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)
  })

  it('waits for every declaration before occupying any hole', async () => {
    const after = await bench(false)
    const fiber = after.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(0)
    after.declareHoles()
    await Promise.resolve()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(1)
    await fiber.dispose()
    for (const hole of HOLES) expect(after.slots.entries(hole)).toHaveLength(0)
  })
})
