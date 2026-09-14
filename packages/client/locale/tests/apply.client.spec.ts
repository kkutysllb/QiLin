/** locale apply wiring: service and base-dictionary provision, document
 * language synchronization, host-preference adoption, and clean teardown. */
import { Context } from '@qilin/kylin'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@qilin/client-ui-renderer/client'
import { apply as settingsApply, inject as settingsInject } from '@qilin/client-ui-settings/client'
import { TestRemote } from '@qilin/client-test-runtime'
import { apply, inject } from '@qilin/client-locale/client'
import type { LocaleRuntime } from '@qilin/client-locale/client'
import { LOCALE_SETTINGS_NAMESPACE, LocaleSettingsSchema } from '../src/locale-settings.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  let preference: string | undefined
  let revision = 0
  const namespace = () => ({
    ns: LOCALE_SETTINGS_NAMESPACE,
    schema: LocaleSettingsSchema.toJSON(),
    value: preference === undefined ? {} : { preference },
    applies: 'live' as const,
    secrets: [],
    revision,
  })
  const describe = vi.fn(async () => ({
    ok: true as const,
    value: { writable: true, hasDocument: true, namespaces: [namespace()] },
  }))
  const mutate = vi.fn(async (_ns: string, ops: { value: string }[]) => {
    preference = ops[0]!.value
    revision += 1
    return { ok: true as const, value: namespace() }
  })
  const events = new TestRemote(ctx, { settings: { describe, mutate } })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  return {
    ctx, slots: ctx.get('slots') as SlotRegistry, describe, mutate, events,
    setHostPreference: (next: string | undefined) => { preference = next; revision += 1 },
  }
}

describe('locale apply', () => {
  // These are wiring specs, not default-language specs. A fresh LocaleRuntime
  // with no jsdom `window` skips browser detection and opens on FALLBACK_LOCALE
  // (en); each test that reads localized copy stages its locale explicitly via
  // setLocale or a Host preference instead of leaning on a dead browser pin.

  it('declares the slot service', () => {
    expect(inject).toEqual(['slots', 'remote', 'settingsScope'])
  })

  it('provides the service with the base dictionaries and leaves the settings rows to their features', async () => {
    const before = await bench()
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    const locale = before.ctx.get('locale') as LocaleRuntime
    // Base dictionaries are registered: the (ns, locale) seats are occupied.
    expect(() => locale.register('common', 'zh', {})).toThrow('already has locale')
    expect(() => locale.register('common', 'en', {})).toThrow('already has locale')
    // The lane has no jsdom `window`, so detection never runs and a fresh
    // service opens on FALLBACK_LOCALE (en); read the zh side explicitly.
    locale.setLocale('zh')
    expect(locale.bind('common')('brand.localBuild')).toBe('QiLin')
    expect(locale.getLocale().locales.map(l => l.id)).toEqual(['zh', 'en'])
  })

  it('projects external locale registration and disposal into the registry', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const locale = b.ctx.get('locale') as LocaleRuntime

    const languagePack = b.ctx.plugin({
      inject: ['locale'],
      apply: packCtx => packCtx.effect(
        () => packCtx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }),
        'test language pack registration',
      ),
    })
    await languagePack.await()
    expect(locale.getLocale().locales.map(option => ({ id: option.id, label: option.label }))).toEqual([
      { id: 'zh', label: '中文' },
      { id: 'en', label: 'English' },
      { id: 'ja', label: '日本語' },
    ])

    await languagePack.dispose()
    expect(locale.getLocale().locales.map(option => option.id)).toEqual(['zh', 'en'])
  })

  it('loads and refreshes the explicit Host preference after nonblocking activation', async () => {
    const b = await bench()
    // The shared mirror read once at bench time; a Host-side change reaches it
    // through the document invalidation, exactly as production announces one.
    // Preference must differ from the provisional locale (FALLBACK_LOCALE = en
    // with no window), or clearing it below would be unobservable.
    b.setHostPreference('zh')
    b.events.emit('settings/document-updated', [LOCALE_SETTINGS_NAMESPACE, 0])
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const locale = b.ctx.get('locale') as LocaleRuntime
    await vi.waitFor(() => { expect(locale.getLocale().active).toBe('zh') })
    // Cleared preference falls back to the provisional locale.
    b.setHostPreference(undefined)
    b.events.emit('settings/document-updated', [LOCALE_SETTINGS_NAMESPACE, 0])
    await vi.waitFor(() => { expect(locale.getLocale().active).toBe('en') })
    // Re-selecting zh after the clear is an explicit pick of the provisional
    // value and must persist as a written preference.
    b.setHostPreference('zh')
    b.events.emit('settings/document-updated', [LOCALE_SETTINGS_NAMESPACE, 0])
    await vi.waitFor(() => { expect(locale.getLocale().active).toBe('zh') })
    expect(b.describe).toHaveBeenCalledTimes(4)
  })

  it('teardown releases the service subscription', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const locale = b.ctx.get('locale') as LocaleRuntime
    await fiber.dispose()
    // The effect that synced the document language left with the fiber.
    expect(locale.getLocale().active).toBe('en')
  })
})
