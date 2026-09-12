/**
 * The QiLin brand layer is one `ctx.theme` override source: it must name a
 * stable source, state both palette modes for every token, and leave no layer
 * behind when its plugin fiber unloads.
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { QILIN_THEME_SOURCE, QILIN_TOKENS } from '../src/client/tokens.ts'

describe('qilin brand theme plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the theme service it uses', () => {
    expect(inject).toEqual(['theme'])
  })

  it('states both palette modes for every QiLin token', () => {
    for (const [name, modes] of Object.entries(QILIN_TOKENS)) {
      expect(name.startsWith('--dsw-'), JSON.stringify(name)).toBe(true)
      expect(modes.light, name).toMatch(/^#[0-9a-f]{6}$/)
      expect(modes.dark, name).toMatch(/^#[0-9a-f]{6}$/)
      expect(modes.light, name).not.toBe(modes.dark)
    }
  })

  it('stacks the layer under its package source and removes it on unload', async () => {
    const ctx = new Context()
    const dispose = vi.fn()
    const overrideTokens = vi.fn(() => dispose)
    ctx.provide('theme', { overrideTokens } as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(overrideTokens).toHaveBeenCalledTimes(1)
    expect(overrideTokens).toHaveBeenCalledWith(QILIN_THEME_SOURCE, QILIN_TOKENS)
    await fiber.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
