// @vitest-environment jsdom
/** The theme bootstrap injection row and the resulting pre-plugin browser theme. */
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootThemeInjections } from '../src/boot-theme.ts'
import type { ThemePreference } from '../src/theme-settings.ts'

const DARK_ATTRIBUTE = 'data-ds-dark-theme'

function mockSystemDark(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches }) as MediaQueryList))
}

function executeBootstrap(
  preference?: ThemePreference,
  fontSizes?: { text: number; code: number; terminal: number },
  fontFamilies?: { text: string; code: string; terminal: string },
): void {
  for (const row of bootThemeInjections(preference, fontSizes, fontFamilies)) {
    if (row.kind === 'script') runInNewContext(row.text, { document, matchMedia: globalThis.matchMedia })
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.dsThemeSource
  document.body.removeAttribute(DARK_ATTRIBUTE)
  document.body.style.removeProperty('--qilin-content-font-size')
})

describe('theme bootstrap row', () => {
  it('colors the body with head CSS before applying body state', () => {
    mockSystemDark(false)
    const [head, body] = bootThemeInjections('dark')
    expect(head).toMatchObject({ kind: 'style' })
    expect(body).toMatchObject({ kind: 'script', placement: 'body' })
    if (head?.kind !== 'style') throw new Error('theme head bootstrap row is not a style')
    expect(head.text).toBe(':root{color-scheme:dark}body{background-color:#151517;--qilin-boot-bg:#151517}')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
    if (body?.kind !== 'script') throw new Error('theme body bootstrap row is not a script')
    runInNewContext(body.text, { document, matchMedia: globalThis.matchMedia })
    expect(document.documentElement.dataset.dsThemeSource).toBe('dark')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(true)
  })

  it('lets durable light override a dark OS and clears stale dark state', () => {
    document.body.setAttribute(DARK_ATTRIBUTE, '')
    mockSystemDark(true)
    const [head] = bootThemeInjections('light')
    if (head?.kind !== 'style') throw new Error('theme head bootstrap row is not a style')
    expect(head.text).toBe(':root{color-scheme:light}body{background-color:#fff;--qilin-boot-bg:#fff}')
    executeBootstrap('light')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
  })

  it.each([
    [true, true],
    [false, false],
  ] as const)('resolves system=%s for the body palette', (matches, dark) => {
    mockSystemDark(matches)
    executeBootstrap('system')
    expect(document.documentElement.dataset.dsThemeSource).toBe('system')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(dark)
  })

  it('uses a media query for the system canvas palette', () => {
    const [head] = bootThemeInjections('system')
    if (head?.kind !== 'style') throw new Error('theme head bootstrap row is not a style')
    expect(head.text).toBe(
      ':root{color-scheme:light}body{background-color:#fff;--qilin-boot-bg:#fff}'
      + '@media(prefers-color-scheme:dark){:root{color-scheme:dark}body{background-color:#151517;--qilin-boot-bg:#151517}}',
    )
  })

  it('defaults to system and falls back to light when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    executeBootstrap()
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
  })

  it('writes the durable content font size and defaults it to 14px', () => {
    mockSystemDark(false)
    executeBootstrap('light', { text: 22, code: 11, terminal: 13 })
    expect(document.body.style.getPropertyValue('--qilin-content-font-size')).toBe('22px')
    executeBootstrap('light')
    expect(document.body.style.getPropertyValue('--qilin-content-font-size')).toBe('14px')
  })

  it('writes user font lists on the body, skipping empty roles (the document boots once; live clearing belongs to the presenter)', () => {
    mockSystemDark(false)
    executeBootstrap('light', undefined, { text: '"Inter"', code: '"Iosevka"', terminal: '"Hack"' })
    expect(document.body.style.getPropertyValue('--qilin-font-family-text')).toBe('"Inter"')
    expect(document.body.style.getPropertyValue('--qilin-font-family-code')).toBe('"Iosevka"')
    expect(document.body.style.getPropertyValue('--qilin-font-family-terminal')).toBe('"Hack"')
    // A second boot with empty roles does not rewrite them; within a live
    // document the presenter clears the variables on change instead.
    executeBootstrap('light')
    expect(document.body.style.getPropertyValue('--qilin-font-family-text')).toBe('"Inter"')
  })

  it('writes the code and terminal sizes and defaults them', () => {
    mockSystemDark(false)
    executeBootstrap('light', { text: 14, code: 13, terminal: 17 })
    expect(document.body.style.getPropertyValue('--qilin-code-font-size')).toBe('13px')
    expect(document.body.style.getPropertyValue('--qilin-terminal-font-size')).toBe('17px')
    executeBootstrap('light')
    expect(document.body.style.getPropertyValue('--qilin-code-font-size')).toBe('11px')
    expect(document.body.style.getPropertyValue('--qilin-terminal-font-size')).toBe('13px')
  })


})
