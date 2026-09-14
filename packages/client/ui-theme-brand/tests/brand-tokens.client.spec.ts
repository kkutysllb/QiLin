// @vitest-environment jsdom
/**
 * The QiLin brand layer is one `ctx.theme` override source over the real
 * theme runtime: it must name a stable source, resolve per palette mode, and
 * leave no layer behind when its plugin fiber unloads.
 */

import { Context } from '@qilin/kylin'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stubSettingsScope } from '@qilin/client-test-runtime'
import { ThemeRuntime } from '@qilin/client-ui-theme/client'
import type { ThemeSettings } from '@qilin/client-ui-theme/client'
import { describe, expect, it } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { QILIN_TOKENS } from '../src/client/tokens.ts'

const BRAND = '--dsw-alias-brand-primary'
const SIDEBAR = '--dsw-specific-sidebar-fill'
const SEAL = '--dsw-specific-brand-seal-fill'

/**
 * The seal body gradient stops, read from the source that owns them. The mark
 * carries its own colours rather than a themed icon, so this token mirrors its
 * values; the check is source-level because no export crosses the two feature
 * packages.
 */
const SEAL_STOPS = [...readFileSync(
  resolve('packages/client/ui-brand/src/client/Seal.tsx'),
  'utf8',
).matchAll(/#[0-9a-f]{6}/gu)].map(match => match[0])

/**
 * Boot the production theme runtime and expose it as the `theme` service the
 * plugin injects, so the layer composes through the shipped override stack.
 */
function bench() {
  const ctx = new Context()
  const theme = new ThemeRuntime(ctx, stubSettingsScope<ThemeSettings>().scope)
  ctx.provide('theme', theme)
  return { ctx, theme }
}

describe('qilin brand theme plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the theme service it uses', () => {
    expect(inject).toEqual(['theme'])
  })

  it('states both palette modes for every QiLin token', () => {
    for (const [name, modes] of Object.entries(QILIN_TOKENS)) {
      expect(name.startsWith('--dsw-'), name).toBe(true)
      expect(modes.light, name).toMatch(/^(#[0-9a-f]{6}|rgba\([0-9, .]+\))$/)
      expect(modes.dark, name).toMatch(/^(#[0-9a-f]{6}|rgba\([0-9, .]+\))$/)
      expect(modes.light, name).not.toBe(modes.dark)
    }
    expect(QILIN_TOKENS[SIDEBAR]).toEqual({ light: '#f1ece0', dark: '#0d0b09' })
    // Landing VI pins: the dark accent is the landing gold-500 and the dark
    // canvas its background; the light link gold is the AA-derived step.
    expect(QILIN_TOKENS[BRAND]).toEqual({ light: '#8f6f2e', dark: '#c9a24a' })
    expect(QILIN_TOKENS['--dsw-alias-link']).toEqual({ light: '#7d6126', dark: '#f3dc9e' })
    expect(QILIN_TOKENS['--dsw-alias-bg-base']).toEqual({ light: '#f8f5ee', dark: '#0d0b09' })
    // Both seal values are stops of the seal body gradient in ui-brand
    // Seal.tsx, and each clears 4.5:1 against the surface it renders on.
    for (const mode of ['light', 'dark'] as const) {
      expect(SEAL_STOPS).toContain(QILIN_TOKENS[SEAL]?.[mode])
    }
  })

  it('stacks the QiLin palette over the active theme and removes it on unload', async () => {
    const { ctx, theme } = bench()
    expect(theme.getTheme().active.tokens[BRAND]).toBeUndefined()

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(theme.getTheme().active.tokens[BRAND]).toBe(QILIN_TOKENS[BRAND]?.light)
    expect(theme.getTheme().active.tokens[SIDEBAR]).toBe(QILIN_TOKENS[SIDEBAR]?.light)

    theme.setTheme('dark')
    expect(theme.getTheme().active.tokens[BRAND]).toBe(QILIN_TOKENS[BRAND]?.dark)

    await fiber.dispose()
    expect(theme.getTheme().active.tokens[BRAND]).toBeUndefined()
    expect(theme.getTheme().active.tokens[SIDEBAR]).toBeUndefined()
  })
})
