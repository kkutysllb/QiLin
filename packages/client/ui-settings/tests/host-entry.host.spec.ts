/** The Host half of ui-settings: it only registers the developer-tools settings namespace. */
import { Context } from '@qilin-agent/kylin'
import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

describe('ui-settings host entry', () => {
  it('registers the developer-tools namespace without auto-opening the settings document', async () => {
    const release = vi.fn()
    const configure = vi.fn((_config: { auto: boolean }, _actor: unknown) => release)
    const ctx = new Context()
    ctx.provide('settings', { configure } as never)

    await ctx.plugin({ inject: ['settings'], apply }).await()

    expect(configure).toHaveBeenCalledOnce()
    expect(configure.mock.calls[0]?.[0]).toEqual({ auto: false })
    // The registration is an effect: it leaves with the plugin fiber.
    await ctx.fiber.dispose()
    expect(release).toHaveBeenCalledOnce()
  })

  it('waits for the settings service instead of reading it eagerly', async () => {
    const configure = vi.fn(() => () => {})
    const ctx = new Context()

    const fiber = ctx.plugin({ inject: ['settings'], apply })
    await Promise.resolve()
    expect(configure).not.toHaveBeenCalled()

    ctx.provide('settings', { configure } as never)
    await fiber.await()
    expect(configure).toHaveBeenCalledOnce()
    await fiber.dispose()
  })
})
