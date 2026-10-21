// @vitest-environment jsdom
/**
 * The QiLin brand skin registers one `ctx.theme` skin over the real theme
 * runtime: it must carry both palette modes, apply only when selected, and
 * leave no registration behind when its plugin fiber unloads.
 */

import { Context } from '@qilin-agent/kylin'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stubConfigForm } from '@qilin-agent/client-test-runtime'
import { ThemeRuntime } from '@qilin-agent/client-ui-theme/client'
import { PLATFORM_BOOT_COLORS, ThemeBootRegistry } from '@qilin-agent/client-ui-theme'
import type { ThemeSettings } from '@qilin-agent/client-ui-theme/client'
import { describe, expect, it } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply, inject as hostInject } from '../src/index.ts'
import { QILIN_SKIN_BOOT, QILIN_SKIN_ID, QILIN_SKIN_LABEL } from '../src/skin.ts'
import { QILIN_TOKENS } from '../src/client/tokens.ts'

const BRAND = '--qilin-alias-brand-primary'
const SIDEBAR = '--qilin-specific-sidebar-fill'
const SEAL = '--qilin-specific-brand-seal-fill'

/**
 * The seal body gradient stops, read from the source that owns them
 * (`BODY_STOPS` in the seal drawing, which lives in ui-primitives so the
 * unbranded fallbacks render the same stamp). The mark carries its own colours
 * rather than a themed icon, so this token mirrors its values; the check is
 * source-level because the stops are module-local, exported nowhere.
 */
const SEAL_STOPS = [...readFileSync(
  resolve('packages/client/ui-primitives/src/QilinSeal.tsx'),
  'utf8',
).matchAll(/#[0-9a-f]{6}/gu)].map(match => match[0])

/**
 * Boot the production theme runtime and expose it as the `theme` service the
 * plugin injects, so the layer composes through the shipped override stack.
 */
function bench() {
  const ctx = new Context()
  const theme = new ThemeRuntime(ctx, stubConfigForm<ThemeSettings>().scope)
  ctx.provide('theme', theme)
  return { ctx, theme }
}

describe('qilin brand theme plugin', () => {
  it('registers the skin canvas colors with the Host boot registry and removes them on unload', async () => {
    const ctx = new Context()
    const boot = new ThemeBootRegistry()
    ctx.provide('themeBoot', boot)
    expect(hostInject).toEqual(['themeBoot'])
    const fiber = ctx.plugin({ inject: [...hostInject], apply: hostApply })
    await fiber.await()
    expect(boot.resolve(QILIN_SKIN_ID)).toEqual(QILIN_SKIN_BOOT)
    await fiber.dispose()
    expect(boot.resolve(QILIN_SKIN_ID)).toEqual(PLATFORM_BOOT_COLORS)
  })

  it('declares only the theme service the browser half uses', () => {
    expect(inject).toEqual(['theme'])
  })

  it('states both palette modes for every QiLin token', () => {
    for (const [name, modes] of Object.entries(QILIN_TOKENS)) {
      expect(name.startsWith('--qilin-'), name).toBe(true)
      expect(modes.light, name).toMatch(/^(#[0-9a-f]{6}|rgba\([0-9, .]+\))$/)
      expect(modes.dark, name).toMatch(/^(#[0-9a-f]{6}|rgba\([0-9, .]+\))$/)
      expect(modes.light, name).not.toBe(modes.dark)
    }
    expect(QILIN_TOKENS[SIDEBAR]).toEqual({ light: '#f1ece0', dark: '#0d0b09' })
    // Landing VI pins: the dark accent is the landing gold-500 and the dark
    // canvas its background; the light link gold is the AA-derived step.
    expect(QILIN_TOKENS[BRAND]).toEqual({ light: '#8f6f2e', dark: '#c9a24a' })
    expect(QILIN_TOKENS['--qilin-alias-link']).toEqual({ light: '#7d6126', dark: '#f3dc9e' })
    expect(QILIN_TOKENS['--qilin-alias-bg-base']).toEqual({ light: '#f8f5ee', dark: '#0d0b09' })
    // Both seal values are stops of the seal body gradient in ui-brand
    // Seal.tsx, and each clears 4.5:1 against the surface it renders on.
    for (const mode of ['light', 'dark'] as const) {
      expect(SEAL_STOPS).toContain(QILIN_TOKENS[SEAL]?.[mode])
    }
  })

  it('registers the QiLin skin, applies it when selected, and removes it on unload', async () => {
    const { ctx, theme } = bench()
    expect(theme.getTheme().skins).toEqual([])
    expect(theme.getTheme().active.tokens[BRAND]).toBeUndefined()

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const skin = theme.getTheme().skins.find(entry => entry.id === QILIN_SKIN_ID)
    expect(skin?.label).toEqual(QILIN_SKIN_LABEL)
    expect(skin?.tokens).toEqual(QILIN_TOKENS)
    // Registration alone leaves the platform palette in place.
    expect(theme.getTheme().active.tokens[BRAND]).toBeUndefined()

    theme.setSkin(QILIN_SKIN_ID)
    expect(theme.getTheme().active.tokens[BRAND]).toBe(QILIN_TOKENS[BRAND]?.light)
    expect(theme.getTheme().active.tokens[SIDEBAR]).toBe(QILIN_TOKENS[SIDEBAR]?.light)

    theme.setTheme('dark')
    expect(theme.getTheme().active.tokens[BRAND]).toBe(QILIN_TOKENS[BRAND]?.dark)

    await fiber.dispose()
    expect(theme.getTheme().skins).toEqual([])
    expect(theme.getTheme().active.tokens[BRAND]).toBeUndefined()
    expect(theme.getTheme().active.tokens[SIDEBAR]).toBeUndefined()
    // The durable selection survives its provider so a later load restores it.
    expect(theme.getTheme().skin).toBe(QILIN_SKIN_ID)
  })
})
