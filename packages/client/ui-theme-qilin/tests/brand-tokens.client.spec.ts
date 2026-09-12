// @vitest-environment jsdom
/**
 * The QiLin brand layer is one `ctx.theme` override source over the real
 * theme runtime: it must name a stable source, resolve per palette mode, and
 * leave no layer behind when its plugin fiber unloads.
 */

import { Context } from '@deepseek-ai/cordis'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { ThemeSettings } from '@deepseek-ai/dsh-client-ui-theme/client'
import { describe, expect, it } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { QILIN_TOKENS } from '../src/client/tokens.ts'

const BRAND = '--dsw-alias-brand-primary'
const SIDEBAR = '--dsw-specific-sidebar-fill'

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
      expect(modes.light, name).toMatch(/^#[0-9a-f]{6}$/)
      expect(modes.dark, name).toMatch(/^#[0-9a-f]{6}$/)
      expect(modes.light, name).not.toBe(modes.dark)
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
