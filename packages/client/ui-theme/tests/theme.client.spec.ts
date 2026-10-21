// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import { stubConfigForm, type StubConfigForm } from '@qilin-agent/client-test-runtime'
import type {
  ThemeSettings,
  ThemeSkin,
  ThemeSnapshot,
  ThemeTokenOverrides,
} from '@qilin-agent/client-ui-theme/client'
import { ThemeRuntime } from '@qilin-agent/client-ui-theme/client'
import { FONT_SIZE_SPECS } from '../src/theme-settings.ts'

/** A complete durable section: fixtures pass overrides, defaults fill the rest. */
function fullSection(over: Partial<ThemeSettings>): ThemeSettings {
  return {
    preference: 'system', skin: '', fontSize: 14, codeFontSize: 11, terminalFontSize: 13,
    textFontFamily: '', codeFontFamily: '', terminalFontFamily: '',
    ...over,
  }
}

const make = (host = stubConfigForm<ThemeSettings>()): {
  ctx: Context
  theme: ThemeRuntime
  events: ThemeSnapshot[]
  host: StubConfigForm<ThemeSettings>
} => {
  const ctx = new Context()
  const events: ThemeSnapshot[] = []
  ctx.on('theme/change', (snapshot) => { events.push(snapshot) })
  return { ctx, theme: new ThemeRuntime(ctx, host.scope), events, host }
}

describe('ThemeRuntime', () => {
  it('defaults to the system preference resolved against prefers-color-scheme', () => {
    const { theme } = make()
    const snapshot = theme.getTheme()
    expect(snapshot.preference).toBe('system')
    expect(snapshot.fontSizes).toEqual({ text: 14, code: 11, terminal: 13 })
    // jsdom matchMedia is absent; system resolves to light.
    expect(snapshot.active.id).toBe('light')
    expect(snapshot.active.colorScheme).toBe('light')
    expect(snapshot.themes.map(t => t.id)).toEqual(['light', 'dark'])
  })

  it('seeds the initial font size from the boot-script body variable, ignoring junk', () => {
    // The Host boot script writes the durable size on body before any plugin
    // runs; the first snapshot must match it so activation never flashes 14.
    document.body.style.setProperty('--qilin-content-font-size', '16px')
    try {
      expect(make().theme.getTheme().fontSizes).toEqual({ text: 16, code: 11, terminal: 13 })
      document.body.style.setProperty('--qilin-content-font-size', '99px')
      expect(make().theme.getTheme().fontSizes.text).toBe(14)
    } finally {
      document.body.style.removeProperty('--qilin-content-font-size')
    }
  })

  it('setFontSize switches per role, writes through the scope, and republishes; same value is a no-op', () => {
    const { theme, events, host } = make()
    theme.setFontSize('text', 17)
    theme.setFontSize('code', 12)
    theme.setFontSize('terminal', 16)
    expect(theme.getTheme().fontSizes).toEqual({ text: 17, code: 12, terminal: 16 })
    expect(host.set).toHaveBeenCalledWith('fontSize', 17)
    expect(host.set).toHaveBeenCalledWith('codeFontSize', 12)
    expect(host.set).toHaveBeenCalledWith('terminalFontSize', 16)
    theme.setFontSize('text', 17)
    expect(events).toHaveLength(3)
    expect(host.set).toHaveBeenCalledTimes(3)
  })

  it('setFontFamily writes the role list through the scope and republishes', () => {
    const { theme, events, host } = make()
    theme.setFontFamily('terminal', '"MesloLGS NF"')
    expect(theme.getTheme().fontFamilies.terminal).toBe('"MesloLGS NF"')
    expect(host.set).toHaveBeenCalledWith('terminalFontFamily', '"MesloLGS NF"')
    theme.setFontFamily('terminal', '')
    expect(theme.getTheme().fontFamilies.terminal).toBe('')
    expect(host.set).toHaveBeenLastCalledWith('terminalFontFamily', '')
    expect(events).toHaveLength(2)
    // The already-normalized list is a no-op.
    theme.setFontFamily('terminal', '')
    expect(events).toHaveLength(2)
    expect(host.set).toHaveBeenCalledTimes(2)
  })

  it('rejects out-of-range and fractional font sizes per role range', () => {
    const { theme, events, host } = make()
    for (const pair of [['text', 9], ['text', 23], ['code', 9], ['code', 17], ['terminal', 9], ['terminal', 21]] as const) {
      expect(() => { theme.setFontSize(pair[0], pair[1]) }).toThrow(new RegExp(`outside ${FONT_SIZE_SPECS[pair[0]].min}..${FONT_SIZE_SPECS[pair[0]].max}`))
    }
    expect(() => { theme.setFontSize('text', 14.5) }).toThrow()
    expect(() => { theme.setFontSize('text', Number.NaN) }).toThrow()
    expect(events).toHaveLength(0)
    expect(host.set).not.toHaveBeenCalled()
  })

  it('adopts a published Host font size without writing it back', () => {
    const { theme, events, host } = make()
    host.publish({ status: 'ready', value: fullSection({ fontSize: 12 }), revision: 1, writable: true })
    expect(theme.getTheme().fontSizes.text).toBe(12)
    expect(events).toHaveLength(1)
    expect(host.set).not.toHaveBeenCalled()
  })

  it('setTheme switches, writes through the scope, republishes, and keeps DOM untouched', () => {
    const { theme, events, host } = make()
    theme.setTheme('dark')
    expect(theme.getTheme().preference).toBe('dark')
    expect(theme.getTheme().active.colorScheme).toBe('dark')
    expect(host.set).toHaveBeenCalledWith('preference', 'dark')
    expect(events).toHaveLength(1)
    expect(events[0]).toBe(theme.getTheme())
    // The service never touches presentation state.
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
    // Same-value set is a no-op (no extra event).
    theme.setTheme('dark')
    expect(events).toHaveLength(1)
    expect(host.set).toHaveBeenCalledOnce()
  })

  it('adopts a published Host section without writing it back', () => {
    const { theme, events, host } = make()
    host.publish({ status: 'ready', value: fullSection({ preference: 'dark' }), revision: 1, writable: true })
    expect(theme.getTheme().preference).toBe('dark')
    expect(events).toHaveLength(1)
    expect(host.set).not.toHaveBeenCalled()
    host.publish({ value: fullSection({ preference: 'dark' }), revision: 2 })
    expect(events).toHaveLength(1)
  })

  it('adopts a section already standing at construction', () => {
    const host = stubConfigForm<ThemeSettings>()
    host.publish({ status: 'ready', value: fullSection({ preference: 'dark' }), revision: 1, writable: true })
    const { theme } = make(host)
    expect(theme.getTheme().preference).toBe('dark')
  })

  it('throws on unknown setTheme ids, duplicate registration, and the system id', () => {
    const { theme } = make()
    expect(() => { theme.setTheme('sepia') }).toThrow('not registered')
    expect(() => theme.register({ id: 'light', colorScheme: 'light', tokens: {} })).toThrow('already registered')
    expect(() => theme.register({ id: 'system', colorScheme: 'light', tokens: {} })).toThrow('preference')
  })

  it('registered themes join the snapshot; disposing the active one resets to default', () => {
    const { theme, events, host } = make()
    const dispose = theme.register({ id: 'sepia', colorScheme: 'light', tokens: { '--qilin-alias-bg-base': 'red' } })
    expect(theme.getTheme().themes.map(t => t.id)).toEqual(['light', 'dark', 'sepia'])
    theme.setTheme('sepia')
    expect(theme.getTheme().active.tokens['--qilin-alias-bg-base']).toBe('red')
    dispose()
    expect(theme.getTheme().preference).toBe('system')
    expect(theme.getTheme().themes.map(t => t.id)).toEqual(['light', 'dark'])
    // Custom ids are in-process extension themes; only the built-in product
    // preferences cross the Host settings schema.
    expect(host.set).not.toHaveBeenCalled()
    // register + set + dispose = three publishes; disposer is idempotent.
    expect(events.length).toBe(3)
    dispose()
    expect(events.length).toBe(3)
  })

  it('disposing an inactive theme keeps the active preference', () => {
    const { theme } = make()
    const dispose = theme.register({ id: 'sepia', colorScheme: 'light', tokens: {} })
    theme.setTheme('dark')
    dispose()
    expect(theme.getTheme().preference).toBe('dark')
  })

  it('revision increases monotonically across every publish', () => {
    const { theme, events } = make()
    theme.setTheme('dark')
    theme.setTheme('light')
    const dispose = theme.register({ id: 'sepia', colorScheme: 'dark', tokens: {} })
    dispose()
    expect(events.map(e => e.revision)).toEqual([1, 2, 3, 4])
  })

  it('stacks reversible token overrides in call order and selects the active palette value', () => {
    const { theme } = make()
    const firstTokens: ThemeTokenOverrides = {
      '--shared': { light: 'first-light', dark: 'first-dark' },
      '--first': { light: 'first-only-light', dark: 'first-only-dark' },
    }
    const disposeFirst = theme.overrideTokens('first', firstTokens)
    firstTokens['--shared']!.light = 'mutated-after-call'
    const disposeSecond = theme.overrideTokens('second', {
      '--shared': { light: 'second-light', dark: 'second-dark' },
    })

    expect(theme.getTheme().active.tokens).toMatchObject({
      '--first': 'first-only-light',
      '--shared': 'second-light',
    })
    theme.setTheme('dark')
    expect(theme.getTheme().active.tokens).toMatchObject({
      '--first': 'first-only-dark',
      '--shared': 'second-dark',
    })

    disposeSecond()
    expect(theme.getTheme().active.tokens['--shared']).toBe('first-dark')
    disposeFirst()
    expect(theme.getTheme().active.tokens['--shared']).toBeUndefined()
  })

  it('replacing one source leaves its stale disposer harmless', () => {
    const { theme, events } = make()
    const stale = theme.overrideTokens('package', {
      '--old': { light: 'old-light', dark: 'old-dark' },
    })
    const current = theme.overrideTokens('package', {
      '--new': { light: 'new-light', dark: 'new-dark' },
    })
    stale()
    expect(theme.getTheme().active.tokens).toEqual({ '--new': 'new-light' })
    current()
    current()
    expect(theme.getTheme().active.tokens).toEqual({})
    expect(events).toHaveLength(3)
  })

  describe('color skins', () => {
    const SKIN: ThemeSkin = Object.freeze({
      id: 'qilin',
      label: { zh: '玄金', en: 'Xuanjin' },
      tokens: { '--qilin-alias-bg-base': { light: '#f8f5ee', dark: '#0d0b09' } },
    })

    it('registers a skin without applying it until it is selected', () => {
      const { theme, events } = make()
      const dispose = theme.registerSkin(SKIN)
      expect(theme.getTheme().skins.map(skin => skin.id)).toEqual(['qilin'])
      expect(theme.getTheme().skin).toBe('')
      expect(theme.getTheme().active.tokens).toEqual({})
      dispose()
      dispose()
      expect(theme.getTheme().skins).toEqual([])
      expect(events).toHaveLength(2)
    })

    it('setSkin overlays the selected skin, persists it, and resolves per palette mode', () => {
      const { theme, events, host } = make()
      theme.registerSkin(SKIN)
      theme.setSkin('qilin')
      expect(theme.getTheme().skin).toBe('qilin')
      expect(theme.getTheme().active.tokens['--qilin-alias-bg-base']).toBe('#f8f5ee')
      expect(host.set).toHaveBeenCalledWith('skin', 'qilin')
      theme.setTheme('dark')
      expect(theme.getTheme().active.tokens['--qilin-alias-bg-base']).toBe('#0d0b09')
      theme.setSkin('qilin')
      expect(events).toHaveLength(3)
      expect(host.set).toHaveBeenCalledTimes(2)
    })

    it('rejects unknown ids, the empty registration, and duplicate ids', () => {
      const { theme, events, host } = make()
      expect(() => { theme.setSkin('nope') }).toThrow('not registered')
      expect(() => theme.registerSkin({ ...SKIN, id: '' })).toThrow('platform palette')
      theme.registerSkin(SKIN)
      expect(() => theme.registerSkin(SKIN)).toThrow('already registered')
      theme.setSkin('')
      expect(events).toHaveLength(1)
      expect(host.set).not.toHaveBeenCalled()
    })

    it('folds the skin under explicit override layers', () => {
      const { theme } = make()
      theme.registerSkin(SKIN)
      theme.setSkin('qilin')
      const dispose = theme.overrideTokens('deployment', {
        '--qilin-alias-bg-base': { light: '#000000', dark: '#ffffff' },
      })
      expect(theme.getTheme().active.tokens['--qilin-alias-bg-base']).toBe('#000000')
      dispose()
      expect(theme.getTheme().active.tokens['--qilin-alias-bg-base']).toBe('#f8f5ee')
    })

    it('adopts a durable selection and keeps it when its provider unloads', () => {
      const host = stubConfigForm<ThemeSettings>()
      host.publish({ status: 'ready', value: fullSection({ skin: 'qilin' }), revision: 1, writable: true })
      const { theme, events } = make(host)
      expect(theme.getTheme().skin).toBe('qilin')
      expect(theme.getTheme().active.tokens).toEqual({})
      const dispose = theme.registerSkin(SKIN)
      expect(theme.getTheme().active.tokens['--qilin-alias-bg-base']).toBe('#f8f5ee')
      dispose()
      expect(theme.getTheme().skin).toBe('qilin')
      expect(theme.getTheme().skins).toEqual([])
      expect(theme.getTheme().active.tokens).toEqual({})
      // Adoption at construction, the registration, and the unload.
      expect(events).toHaveLength(3)
      expect(host.set).not.toHaveBeenCalled()
    })

    it('publishes skin tokens once in the inspection catalog', () => {
      const { theme } = make()
      theme.registerSkin({
        ...SKIN,
        tokens: { ...SKIN.tokens, '--qilin-skin-only': { light: 'red', dark: 'blue' } },
      })
      theme.registerSkin({ id: 'second', label: 'Second', tokens: { '--qilin-skin-only': { light: 'red', dark: 'blue' } } })
      const tokens = theme.exportInspectTokens().filter(token => token.name === '--qilin-skin-only')
      expect(tokens).toHaveLength(1)
      expect(tokens[0]).toMatchObject({ valueType: 'CSS value', cssVariable: '--qilin-skin-only' })
    })
  })

  it('exports sorted built-in, registered, and override-only token descriptions as copies', () => {
    const { theme } = make()
    theme.register({
      id: 'custom',
      colorScheme: 'light',
      tokens: {
        '--qilin-alias-bg-base': 'duplicate-built-in',
        '--registered': 'registered',
      },
    })
    theme.overrideTokens('package', {
      '--registered': { light: 'duplicate-registered', dark: 'duplicate-registered' },
      semanticAccent: { light: 'pink', dark: 'red' },
    })

    const tokens = theme.exportInspectTokens()
    expect(tokens.map(token => token.name)).toEqual([...tokens.map(token => token.name)].sort())
    expect(tokens.find(token => token.name === '--registered')).toMatchObject({
      valueType: 'CSS value',
      cssVariable: '--registered',
    })
    const semantic = tokens.find(token => token.name === 'semanticAccent')
    expect(semantic).toMatchObject({ valueType: 'CSS value' })
    expect(semantic).not.toHaveProperty('cssVariable')
    expect(tokens.filter(token => token.name === '--qilin-alias-bg-base')).toHaveLength(1)

    tokens[0]!.description = 'caller mutation'
    expect(theme.exportInspectTokens()[0]!.description).not.toBe('caller mutation')
  })

  it('keeps one description per name when registered themes repeat a built-in or listed token', () => {
    const { theme } = make()
    theme.register({ id: 'custom', colorScheme: 'light', tokens: { '--registered': 'first' } })
    theme.register({
      id: 'custom-two',
      colorScheme: 'light',
      tokens: { '--registered': 'second', '--dsw-alias-bg-base': 'override' },
    })
    const tokens = theme.exportInspectTokens()
    expect(tokens.filter(token => token.name === '--registered')).toHaveLength(1)
    expect(tokens.find(token => token.name === '--registered')?.description)
      .toBe('Theme token registered by the current Client composition.')
    expect(tokens.find(token => token.name === '--dsw-alias-bg-base')?.description)
      .toBe('Application base background.')
  })

  it('rejects every malformed token override value with a teaching error', () => {
    const { theme } = make()
    const override = (value: unknown): void => {
      theme.overrideTokens('package', { '--bad': value } as unknown as ThemeTokenOverrides)
    }
    expect(() => { override('red') }).toThrow(/bare string.*light.*dark/)
    for (const value of [1, null, {}, { light: 1, dark: 'dark' }, { light: 'light' }]) {
      expect(() => { override(value) }).toThrow(/must map to a \{ light, dark \} pair/)
    }
  })

  it('context dispose releases the scope subscription', async () => {
    const { ctx, host } = make()
    expect(host.listenerCount()).toBe(1)
    await ctx.fiber.dispose()
    expect(host.listenerCount()).toBe(0)
  })

  describe('prefers-color-scheme resolution (stubbed matchMedia)', () => {
    type Listener = () => void
    const stubMedia = (initialMatches: boolean) => {
      const listeners = new Set<Listener>()
      const media = {
        matches: initialMatches,
        addEventListener: (_: 'change', fn: Listener) => { listeners.add(fn) },
        removeEventListener: (_: 'change', fn: Listener) => { listeners.delete(fn) },
        flip() {
          this.matches = !this.matches
          for (const fn of listeners) fn()
        },
        listenerCount: () => listeners.size,
      }
      vi.stubGlobal('matchMedia', () => media)
      return media
    }

    afterEach(() => { vi.unstubAllGlobals() })

    it('system resolves against the media query and follows OS flips', () => {
      const media = stubMedia(true)
      const { theme, events } = make()
      expect(theme.getTheme().preference).toBe('system')
      expect(theme.getTheme().active.id).toBe('dark')
      media.flip()
      expect(theme.getTheme().active.id).toBe('light')
      expect(events).toHaveLength(1)
    })

    it('OS flips do not republish while a concrete preference is set', () => {
      const media = stubMedia(false)
      const { theme, events } = make()
      theme.setTheme('light')
      expect(events).toHaveLength(1)
      media.flip()
      expect(events).toHaveLength(1)
      expect(theme.getTheme().active.id).toBe('light')
    })

    it('context dispose releases the media listener', async () => {
      const media = stubMedia(false)
      const { ctx } = make()
      expect(media.listenerCount()).toBe(1)
      await ctx.fiber.dispose()
      expect(media.listenerCount()).toBe(0)
    })
  })
})
