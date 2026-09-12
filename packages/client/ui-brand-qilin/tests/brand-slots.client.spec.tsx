// @vitest-environment jsdom
/**
 * The QiLin brand plugin must occupy exactly the two brand-mark slots it
 * declares, wait for both declarations, and release every occupant when its
 * fiber unloads.
 */

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SlotRegistry } from '@qilin/client-ui-renderer/client'
import { apply, inject } from '../src/client/index.ts'
import { QilinSealArtist, QilinSealMark } from '../src/client/Seal.tsx'
import { apply as hostApply } from '../src/index.ts'

afterEach(() => { cleanup() })

const HOLES = ['sidebar.brand.mark', 'conversation.hero.brand.mark'] as const

/**
 * Build a slot runtime with the two brand holes a surface owner declares.
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

  it('renders the seal as one framed square carrying both glyph outlines', () => {
    const { container } = render(<QilinSealArtist size={24} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('rect')).toHaveLength(1)
    const glyphs = [...container.querySelectorAll('path')]
    expect(glyphs).toHaveLength(2)
    for (const glyph of glyphs) {
      expect(glyph.getAttribute('d')?.length ?? 0).toBeGreaterThan(1000)
      expect(glyph.getAttribute('transform')).toContain('scale(')
    }
  })

  it('renders the sidebar occupant at the requested size', () => {
    const { container } = render(<QilinSealMark size={18} />)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('18')
  })

  it('fills both holes and removes every occupant on teardown', async () => {
    const before = await bench()
    const fiber = before.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(1)

    await fiber.dispose()
    for (const hole of HOLES) expect(before.slots.entries(hole)).toHaveLength(0)
  })

  it('waits for both declarations before occupying either hole', async () => {
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
