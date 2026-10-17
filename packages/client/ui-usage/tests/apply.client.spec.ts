/** The usage page's Settings registration: its seat, its order, and the dictionaries it owns. */

import { Context } from '@qilin-agent/kylin'
import { describe, expect, it } from 'vitest'
import { resolveSlotLabel } from '@qilin-agent/client-ui-slots'
import { SlotRegistry } from '@qilin-agent/client-ui-renderer/client'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyHost } from '../src/index.ts'
import { UsageSection } from '../src/client/UsageSection.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

async function bench(): Promise<{ ctx: Context; locale: LocaleRuntime; slots: SlotRegistry }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  return { ctx, locale, slots: ctx.get('slots') as SlotRegistry }
}

/** Declare the shell's settings-section list the way ui-settings' entry does. */
function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-usage host entry', () => {
  it('adds no Host behavior', () => {
    // The package ships a Host row only so the Loader can register the
    // browser half; the entry itself contributes nothing.
    expect(() => { applyHost() }).not.toThrow()
  })
})

describe('ui-usage apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('seats the usage page as a settings section with its own order and a locale-following label', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.section')[0]
    if (entry === undefined) throw new Error('the usage section was not registered')
    expect(entry.component).toBe(UsageSection)
    expect(entry.options).toMatchObject({ id: 'usage', order: 25 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe(zh.nav)

    b.locale.setLocale('en')
    expect(resolveSlotLabel(entry.options.label)).toBe(en.nav)
    // The label rides the thunk rather than a re-registration.
    expect(b.slots.entries('settings.section')).toHaveLength(1)
  })

  it('frees its seat and its dictionaries with the plugin fiber', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('settings.section')).toHaveLength(1)

    await fiber.dispose()
    expect(b.slots.entries('settings.section')).toEqual([])
    // The (namespace, locale) seats are free again — the dictionary disposer ran.
    expect(() => b.locale.register(NS, 'zh', {})).not.toThrow()
    expect(() => b.locale.register(NS, 'en', {})).not.toThrow()
  })
})
