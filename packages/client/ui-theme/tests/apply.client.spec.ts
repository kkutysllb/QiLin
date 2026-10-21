/** ui-theme apply wiring: service provision, settings dictionaries riding the
 * locale service, declaration-aware Appearance row registration, snapshot
 * projection into the row store, and HMR collapse recovery. */
import { Context } from '@qilin-agent/kylin'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { SlotRegistry } from '@qilin-agent/client-ui-renderer/client'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { TestRemote } from '@qilin-agent/client-test-runtime'
import { apply as settingsApply, inject as settingsInject } from '@qilin-agent/client-ui-settings/client'
import { apply, inject, SETTINGS_NS } from '@qilin-agent/client-ui-theme/client'
import type { AppearanceRowInjected, FontSettingsInjected, ThemeRuntime } from '@qilin-agent/client-ui-theme/client'
import { THEME_SETTINGS_NAMESPACE, ThemeSettingsSchema } from '../src/theme-settings.ts'
import { AppearanceRow } from '../src/client/AppearanceRow.tsx'
import { FontSettingsGroup } from '../src/client/FontSettingsGroup.tsx'
import type { createAppearanceRowStore, createFontRowStore } from '../src/client/settings-store.ts'
import type {
  ShortcutContext, ShortcutFixedInput, ShortcutGesture, ShortcutPlatform, Shortcuts,
} from '@qilin-agent/client-shortcuts/client'
import { bindingKey, normalizeBinding, presentBinding } from '@qilin-agent/client-shortcuts/protocol'
import { ShortcutRegistry } from '../../shortcuts/src/client/registry.ts'

// These specs assert the shipped Chinese copy. The lane has no jsdom `window`,
// so browser-language detection never runs and a fresh LocaleRuntime opens on
// FALLBACK_LOCALE (en); bench stages zh explicitly on the locale instead.

const SLOT = 'settings.general.item'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

async function bench(isLoopback = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const section: Record<string, unknown> = {
    preference: 'system', skin: '', fontSize: 14, codeFontSize: 11, terminalFontSize: 13,
    textFontFamily: '', codeFontFamily: '', terminalFontFamily: '',
  }
  const namespace = () => ({
    ns: THEME_SETTINGS_NAMESPACE,
    schema: ThemeSettingsSchema.toJSON(),
    value: { ...section },
    applies: 'live' as const,
    secrets: [],
    revision: 0,
  })
  const describe = vi.fn(() => Promise.resolve({
    ok: true as const,
    value: { writable: true, hasDocument: true, namespaces: [namespace()] },
  }))
  const mutate = vi.fn((_ns: string, ops: { path: string[]; value: unknown }[]) => {
    for (const op of ops) section[op.path[0]!] = op.value
    return Promise.resolve({ ok: true as const, value: namespace() })
  })
  const events = new TestRemote(ctx, { settings: { describe, mutate } })
  events.$host = { home: undefined, isLoopback }
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  return {
    ctx, slots: ctx.get('slots') as SlotRegistry, locale, describe, mutate, events,
    setHostSection: (next: Record<string, unknown>) => { Object.assign(section, next) },
  }
}

/** Stand in for the settings shell: declare the General item slot from root. */
function declareItems(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

/** Mirror the framework's inject choreography: bake a real instance from the
 * declared handle and hand its actions to the entry's inject factory. */
function rowFaceOf(slots: SlotRegistry, component: unknown) {
  const entry = slots.entries(SLOT).find(e => e.component === component)!
  const handle = entry.store as ReturnType<typeof createFontRowStore>
  const instance = handle.create()
  const face = (entry.inject as unknown as (a: typeof instance.actions) => unknown)(instance.actions)
  return { entry, instance, face: face as FontSettingsInjected }
}

/** Deliver the keyboard service's arbitrated input while keeping its real catalog and bindings. */
function fontKeyboard(ctx: Context, runtime: Shortcuts['runtime'] = 'desktop', platform: ShortcutPlatform = 'macos') {
  onTestFinished(() => ctx.fiber.dispose())
  const registry = new ShortcutRegistry(runtime, platform)
  const listeners = new Set<(input: ShortcutFixedInput) => void>()
  const shortcuts: Pick<Shortcuts, 'runtime' | 'platform' | 'registerFixed' | 'describeBinding' | 'observeFixedInput'> = {
    runtime, platform,
    registerFixed: command => registry.registerFixed(command),
    describeBinding: (candidate) => {
      const binding = candidate === null ? null : normalizeBinding(candidate, platform)
      return { binding, keys: presentBinding(binding, platform).keys, issue: null, conflicts: [] }
    },
    observeFixedInput: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  ctx.provide('shortcuts', shortcuts)
  return {
    registry,
    press: (gesture: Partial<ShortcutGesture> = {}, context: Partial<ShortcutContext> = {}) => {
      const consume = vi.fn()
      for (const listener of listeners) listener({
        type: 'keydown', consume,
        gesture: { code: 'Equal', meta: platform === 'macos', control: platform !== 'macos', alt: false,
          shift: false, repeat: false, composing: false, defaultPrevented: false, ...gesture },
        context: { region: 'page', modal: null, target: null, ...context },
      })
      return consume
    },
    reset: () => { for (const listener of listeners) listener({ type: 'reset' }) },
  }
}

describe('ui-theme apply', () => {
  it('presents both desktop font actions with their accepted physical combinations', async () => {
    const b = await bench()
    const keyboard = fontKeyboard(b.ctx)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(keyboard.registry.fixedCatalog.getSnapshot().map(row => ({
      label: row.label, keys: row.keys, bindings: row.bindings.map(bindingKey),
    }))).toEqual([
      { label: '增大字号', keys: ['⌘', '='], bindings: ['meta+Equal', 'shift+meta+Equal'] },
      { label: '减小字号', keys: ['⌘', '-'], bindings: ['meta+Minus'] },
    ])
    await b.ctx.fiber.dispose()
  })

  it('steps text, code, and terminal sizes together in one saved mutation', async () => {
    const b = await bench()
    const keyboard = fontKeyboard(b.ctx)
    declareItems(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const theme = b.ctx.get('theme') as ThemeRuntime
    const { instance } = rowFaceOf(b.slots, FontSettingsGroup)

    expect(keyboard.press()).toHaveBeenCalledOnce()
    expect(theme.getTheme().fontSizes).toEqual({ text: 15, code: 12, terminal: 14 })
    expect(instance.getSnapshot().fontSizes.text).toBe(15)
    await vi.waitFor(() => { expect(b.mutate).toHaveBeenCalledOnce() })
    expect(b.mutate.mock.calls.at(-1)?.[1]).toEqual([
      { op: 'set', path: ['fontSize'], value: 15 },
      { op: 'set', path: ['codeFontSize'], value: 12 },
      { op: 'set', path: ['terminalFontSize'], value: 14 },
    ])
    keyboard.press({ code: 'Minus' })
    expect(theme.getTheme().fontSizes).toEqual({ text: 14, code: 11, terminal: 13 })
    await vi.waitFor(() => { expect(b.mutate).toHaveBeenCalledTimes(2) })
    await fiber.dispose()
    expect(keyboard.registry.fixedCatalog.getSnapshot()).toEqual([])
    expect(keyboard.press()).not.toHaveBeenCalled()
    await b.ctx.fiber.dispose()
  })

  it('consumes font shortcuts at a size limit without persisting another write', async () => {
    const b = await bench()
    const keyboard = fontKeyboard(b.ctx)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const theme = b.ctx.get('theme') as ThemeRuntime
    theme.setFontSize('text', 22)
    theme.setFontSize('code', 16)
    theme.setFontSize('terminal', 20)
    await vi.waitFor(() => { expect(b.mutate).toHaveBeenCalledTimes(3) })
    expect(keyboard.press()).toHaveBeenCalledOnce()
    expect(theme.getTheme().fontSizes).toEqual({ text: 22, code: 16, terminal: 20 })
    expect(b.mutate).toHaveBeenCalledTimes(3)
    await b.ctx.fiber.dispose()
  })

  it('leaves browser zoom and locally owned input unchanged', async () => {
    const browser = await bench()
    const web = fontKeyboard(browser.ctx, 'web')
    await browser.ctx.plugin({ inject: [...inject], apply }).await()
    expect(web.registry.fixedCatalog.getSnapshot()).toEqual([])
    expect(web.press()).not.toHaveBeenCalled()
    await browser.ctx.fiber.dispose()

    const b = await bench()
    const keyboard = fontKeyboard(b.ctx)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    for (const gesture of [
      { composing: true }, { defaultPrevented: true }, { repeat: true }, { alt: true },
      { meta: false }, { control: true }, { code: 'KeyA' }, { code: 'Minus', shift: true },
    ]) expect(keyboard.press(gesture)).not.toHaveBeenCalled()
    expect(keyboard.press({}, { region: 'terminal' })).not.toHaveBeenCalled()
    keyboard.reset()
    expect((b.ctx.get('theme') as ThemeRuntime).getTheme().fontSizes.text).toBe(14)
    expect(b.mutate).not.toHaveBeenCalled()
    await b.ctx.fiber.dispose()
  })

  it('declares the slot and locale services', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'configForms'])
  })

  it('provides the service, registers localized copy, and registers the appearance and typography rows (declaration before or after apply)', async () => {
    const before = await bench()
    declareItems(before.slots)
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    expect(before.locale.bind(SETTINGS_NS)('appearance.title')).toBe('外观')
    expect(before.locale.bind(SETTINGS_NS)('fontSize.text.title')).toBe('字号大小')
    before.locale.setLocale('en')
    expect(before.locale.bind(SETTINGS_NS)('fontSize.text.title')).toBe('Font size')
    const appearanceEntry = before.slots.entries(SLOT).find(e => e.component === AppearanceRow)!
    expect(appearanceEntry.options).toMatchObject({ id: 'appearance', order: 10 })
    expect(appearanceEntry.locale).toBe(SETTINGS_NS)
    const fontEntry = before.slots.entries(SLOT).find(e => e.component === FontSettingsGroup)!
    expect(fontEntry.options).toMatchObject({ id: 'font-size', order: 11 })
    expect(fontEntry.locale).toBe(SETTINGS_NS)

    const after = await bench()
    const fiber = after.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(after.slots.entries(SLOT)).toHaveLength(0)
    declareItems(after.slots)
    await Promise.resolve()
    expect(after.slots.entries(SLOT).some(e => e.component === FontSettingsGroup)).toBe(true)
    expect(after.slots.entries(SLOT).some(e => e.component === AppearanceRow)).toBe(true)
  })

  it('mirrors the persisted preference into the appearance row and routes face writes back', async () => {
    const b = await bench()
    declareItems(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const theme = b.ctx.get('theme') as ThemeRuntime
    theme.setTheme('dark')

    const entry = b.slots.entries(SLOT).find(e => e.component === AppearanceRow)!
    const handle = entry.store as ReturnType<typeof createAppearanceRowStore>
    const instance = handle.create()
    const face = (entry.inject as unknown as (a: typeof instance.actions) => AppearanceRowInjected)(instance.actions)
    // The inject-time re-sync sealed the init window: the mirror is current.
    expect(instance.getSnapshot().preference).toBe('dark')

    face.setTheme('light')
    expect(theme.getTheme().preference).toBe('light')
    expect(instance.getSnapshot().preference).toBe('light')
    await vi.waitFor(() => { expect(b.mutate).toHaveBeenCalled() })
  })

  it('mirrors registered skins, re-resolves their labels on a language switch, and routes skin writes back', async () => {
    const b = await bench()
    declareItems(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const theme = b.ctx.get('theme') as ThemeRuntime
    const entry = b.slots.entries(SLOT).find(e => e.component === AppearanceRow)!
    const handle = entry.store as ReturnType<typeof createAppearanceRowStore>
    const instance = handle.create()
    const face = (entry.inject as unknown as (a: typeof instance.actions) => AppearanceRowInjected)(instance.actions)

    theme.registerSkin({
      id: 'qilin', label: { zh: '玄金', en: 'Xuanjin' },
      tokens: { '--qilin-skin': { light: '#ffffff', dark: '#000000' } },
    })
    expect(instance.getSnapshot().skins).toEqual([{ id: 'qilin', label: '玄金' }])

    b.locale.setLocale('en')
    expect(instance.getSnapshot().skins).toEqual([{ id: 'qilin', label: 'Xuanjin' }])

    face.setSkin('qilin')
    expect(theme.getTheme().skin).toBe('qilin')
    expect(instance.getSnapshot().skin).toBe('qilin')
    await vi.waitFor(() => { expect(b.mutate).toHaveBeenCalled() })
  })

  it('projects theme snapshots into both row stores and routes face writes back', async () => {
    const b = await bench()
    declareItems(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const theme = b.ctx.get('theme') as ThemeRuntime
    // An event ahead of any inject hits the unbound-actions arm.
    theme.setFontSize('text', 16)

    const { entry, instance, face } = rowFaceOf(b.slots, FontSettingsGroup)
    // The inject-time re-sync sealed the init window: the mirror is current.
    expect(instance.getSnapshot().fontSizes.text).toBe(16)
    // Copy rides the standard locale seat: the entry declares the namespace.
    expect(entry.locale).toBe(SETTINGS_NS)

    face.setFontSize('text', 12)
    expect(theme.getTheme().fontSizes.text).toBe(12)
    expect(instance.getSnapshot().fontSizes.text).toBe(12)

    face.setFontFamily('code', 'Menlo, monospace')
    expect(theme.getTheme().fontFamilies.code).toBe('"Menlo", monospace')
    await vi.waitFor(() => { expect(b.mutate).toHaveBeenCalledTimes(3) })
  })

  it('loads Host settings at boot, refreshes its namespace, and keeps remote browsers process-local', async () => {
    const b = await bench()
    // The shared mirror read once at bench time; a Host-side change reaches it
    // through the document invalidation, exactly as production announces one.
    b.setHostSection({ preference: 'dark', fontSize: 17 })
    b.events.emit('settings/document-updated', [THEME_SETTINGS_NAMESPACE, 0])
    declareItems(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const theme = b.ctx.get('theme') as ThemeRuntime
    await vi.waitFor(() => { expect(theme.getTheme().preference).toBe('dark') })
    expect(theme.getTheme().fontSizes.text).toBe(17)
    // The mirror refreshes on every document commit (ns-agnostic); the scope's
    // derived value only moves when its own namespace changed.
    b.events.emit('settings/document-updated', ['unrelated', 0])
    await vi.waitFor(() => { expect(b.describe).toHaveBeenCalledTimes(3) })
    expect(theme.getTheme().preference).toBe('dark')
    b.setHostSection({ preference: 'light' })
    b.events.emit('settings/document-updated', [THEME_SETTINGS_NAMESPACE, 0])
    await vi.waitFor(() => { expect(theme.getTheme().preference).toBe('light') })
    b.setHostSection({ preference: 'dark' })
    b.ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(theme.getTheme().preference).toBe('dark') })

    const remote = await bench(false)
    declareItems(remote.slots)
    await remote.ctx.plugin({ inject: [...inject], apply }).await()
    const remoteTheme = remote.ctx.get('theme') as ThemeRuntime
    remoteTheme.setTheme('dark')
    await Promise.resolve()
    expect(remote.describe).not.toHaveBeenCalled()
    expect(remote.mutate).not.toHaveBeenCalled()
  })

  it('activates before a slow settings refresh and converges when it settles', async () => {
    const b = await bench()
    b.setHostSection({ preference: 'dark' })
    const describe = b.describe.getMockImplementation()!
    const pending = deferred<Awaited<ReturnType<typeof describe>>>()
    b.describe.mockImplementationOnce(() => pending.promise)
    // The refresh hangs on the wire; the mirror keeps serving the last good
    // answer, so activation never blocks on the settings transport.
    b.events.emit('settings/document-updated', [THEME_SETTINGS_NAMESPACE, 0])
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const theme = b.ctx.get('theme') as ThemeRuntime
    expect(theme.getTheme().preference).toBe('system')
    pending.resolve(await describe())
    await vi.waitFor(() => { expect(theme.getTheme().preference).toBe('dark') })
    await fiber.dispose()
  })

  it('ignores an invalid preference crossing the settings wire', async () => {
    const b = await bench()
    b.setHostSection({ preference: 'sepia' })
    b.events.emit('settings/document-updated', [THEME_SETTINGS_NAMESPACE, 0])
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const theme = b.ctx.get('theme') as ThemeRuntime
    await vi.waitFor(() => { expect(b.describe).toHaveBeenCalledTimes(2) })
    expect(theme.getTheme().preference).toBe('system')
  })

  it('recovers after an HMR collapse of the declaring entry (stale disposer must not block)', async () => {
    const b = await bench()
    const host = declareItems(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries(SLOT)).toHaveLength(2)

    // Collapse: the declarer dies, the cascade removes our entries while the
    // apply closure still holds its (now stale) disposers.
    host()
    expect(b.slots.entries(SLOT)).toHaveLength(0)

    declareItems(b.slots)
    await Promise.resolve()
    expect(b.slots.entries(SLOT).some(e => e.component === FontSettingsGroup)).toBe(true)
  })

  it('teardown removes the rows and the dictionary; teardown without a declaration is quiet', async () => {
    const b = await bench()
    declareItems(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(SLOT)).toHaveLength(2)
    await fiber.dispose()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    // Dictionary disposal: translation falls back to the bare key.
    expect(b.locale.bind(SETTINGS_NS)('fontSize.text.title')).toBe('fontSize.text.title')

    // Never-declared bench: the effect disposer's dispose arm stays undefined.
    const quiet = await bench()
    const f2 = quiet.ctx.plugin({ inject: [...inject], apply })
    await f2.await()
    await f2.dispose()
    expect(quiet.slots.entries(SLOT)).toHaveLength(0)
  })
})
