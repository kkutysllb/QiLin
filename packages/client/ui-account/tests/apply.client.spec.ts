/**
 * The account plugin's browser entry: the services it binds, the single
 * sidebar-footer contribution it installs and retires with its fiber, the
 * dictionaries it registers, and the injected face that routes to the theme,
 * locale, and settings services.
 */
import { Context } from '@qilin/kylin'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@qilin/client-locale/client'
import { SlotRegistry } from '@qilin/client-ui-renderer/client'
import { AccountMenu } from '../src/client/AccountMenu.tsx'
import type { AccountMenuInjected } from '../src/client/AccountMenu.tsx'
import { apply, inject, NS } from '../src/client/index.ts'
import { en, zh } from '../src/client/locales.ts'
import { apply as hostApply } from '../src/index.ts'

/** The footer list the sidebar shell declares. */
function declareFooter(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

/**
 * Boot the browser half over a real slot tree and double theme service.
 * @param declare - whether the footer hole exists before the plugin mounts.
 * @param settingsShell - whether the optional settings panel service is mounted.
 * @returns the context, its registry, the doubles, and the declaration control.
 */
async function bench(declare = true, settingsShell = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  ctx.provide('locale', new LocaleRuntime(ctx))
  const theme = {
    preference: 'system',
    setTheme: vi.fn((id: string) => { theme.preference = id }),
    getTheme: () => ({
      preference: theme.preference,
      fontSize: 14,
      active: { id: 'light', colorScheme: 'light', tokens: {} },
      themes: [],
      revision: 0,
    }),
  }
  ctx.provide('theme', theme as never)
  const openPanel = vi.fn()
  if (settingsShell) ctx.provide('settingsShell', { open: openPanel } as never)
  const disposeFooter = declare ? declareFooter(slots) : undefined
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, fiber, theme, openPanel, disposeFooter, declareFooter: () => declareFooter(slots) }
}

/** The one contribution's inject face, built the way the renderer builds it. */
function faceOf(slots: SlotRegistry): AccountMenuInjected {
  const entry = slots.entries('sidebar.footer.action')[0]!
  return (entry.inject as unknown as () => AccountMenuInjected)()
}

describe('ui-account apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares the services the menu binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'theme'])
  })

  it('mounts without a settings panel and reports no settings row', async () => {
    const { slots, fiber } = await bench(true, false)
    const entry = slots.entries('sidebar.footer.action')[0]
    expect(entry).toBeDefined()
    expect(faceOf(slots).hooks.settingsPanel.getSnapshot()).toBe(false)
    await fiber.dispose()
  })

  it('publishes the settings row only while the panel service is mounted', async () => {
    const { ctx, slots, fiber } = await bench(true, false)
    const presence = faceOf(slots).hooks.settingsPanel
    expect(presence.getSnapshot()).toBe(false)

    const retract = ctx.provide('settingsShell', { open: () => {} } as never)
    await vi.waitFor(() => { expect(presence.getSnapshot()).toBe(true) })

    retract()
    await vi.waitFor(() => { expect(presence.getSnapshot()).toBe(false) })
    await fiber.dispose()
  })

  it('contributes exactly one footer action and removes it with its fiber', async () => {
    const { slots, fiber, disposeFooter } = await bench()
    const entry = slots.entries('sidebar.footer.action')
    expect(entry).toHaveLength(1)
    expect(entry[0]?.component).toBe(AccountMenu)
    expect(entry[0]?.options).toMatchObject({ id: 'account', order: 0 })

    await fiber.dispose()
    expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
    disposeFooter?.()
  })

  it('waits for the sidebar declaration before contributing', async () => {
    const { slots, fiber, declareFooter } = await bench(false)
    expect(slots.entries('sidebar.footer.action')).toHaveLength(0)

    declareFooter()
    await vi.waitFor(() => { expect(slots.entries('sidebar.footer.action')).toHaveLength(1) })

    await fiber.dispose()
    expect(slots.entries('sidebar.footer.action')).toHaveLength(0)
  })

  it('registers the account dictionaries and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    // The node lane has no `window`, so the runtime opens on the fallback
    // locale (en); state the asserted language explicitly.
    ctx.locale.setLocale('zh')
    expect(NS).toBe('account')
    expect(translate('label')).toBe(zh.label)
    expect(translate('signOut')).toBe(zh.signOut)
    ctx.locale.setLocale('en')
    expect(translate('label')).toBe(en.label)

    // Withdrawn dictionaries leave the key unresolved rather than translated.
    await fiber.dispose()
    expect(translate('label')).not.toBe(en.label)
  })

  it('routes the injected face to the settings, theme, and locale services', async () => {
    const { ctx, slots, theme, openPanel, fiber } = await bench()
    const face = faceOf(slots)

    face.openSettings()
    face.setTheme('dark')
    face.setLocale('en')

    expect(openPanel).toHaveBeenCalledTimes(1)
    expect(theme.setTheme).toHaveBeenCalledWith('dark')
    expect(face.hooks.theme.getSnapshot().preference).toBe('dark')
    expect(ctx.locale.getSnapshot().active).toBe('en')
    await fiber.dispose()
  })

  it('exposes live theme and locale sources for the renderer to bind', async () => {
    const { ctx, slots, fiber } = await bench()
    const face = faceOf(slots)

    const themeEvents: string[] = []
    const stopTheme = face.hooks.theme.subscribe(() => { themeEvents.push('theme') })
    ctx.emit('theme/change', face.hooks.theme.getSnapshot())
    expect(themeEvents).toEqual(['theme'])
    stopTheme()

    const localeEvents: string[] = []
    const stopLocale = face.hooks.locale.subscribe(() => { localeEvents.push('locale') })
    ctx.locale.setLocale('zh')
    expect(localeEvents).toEqual(['locale'])
    stopLocale()

    expect(face.hooks.locale.getSnapshot().active).toBe('zh')
    await fiber.dispose()
  })
})
