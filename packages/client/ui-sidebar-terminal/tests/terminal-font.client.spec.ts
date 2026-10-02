// @vitest-environment jsdom
/**
 * The terminal font resolver: the base-family precedence, the generic
 * terminator, the icon fallbacks, and the size clamp.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TERMINAL_FONT_FAMILY, ICON_FONT_FALLBACKS, TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN,
  clampTerminalFontSize, resolveTerminalFont, withIconFontFallbacks, withMonospaceFallback,
} from '../src/client/terminal-font.ts'

describe('terminal font — icon fallbacks', () => {
  it('appends every icon family to a base stack', () => {
    const stack = withIconFontFallbacks('user mono, monospace')
    expect(stack.startsWith('user mono, ')).toBe(true)
    for (const family of ICON_FONT_FALLBACKS) expect(stack).toContain(family)
  })

  it('keeps a family the stack already names', () => {
    const stack = withIconFontFallbacks('"Hack Nerd Font Mono", monospace')
    expect(stack.match(/"Hack Nerd Font Mono"/gu)).toHaveLength(1)
  })

  it('mentions each icon family once when applied twice', () => {
    const once = withIconFontFallbacks('user mono')
    expect(withIconFontFallbacks(once)).toBe(once)
  })

  it('falls back to the icon families alone for an empty stack', () => {
    expect(withIconFontFallbacks('')).toBe(ICON_FONT_FALLBACKS.join(', '))
  })

  it('splices before the first generic, and after a leading one only the symbols-only patches', () => {
    const trailing = withIconFontFallbacks('user mono, monospace')
    expect(trailing.indexOf('"Symbols Nerd Font Mono"')).toBeLessThan(trailing.indexOf('monospace'))
    const leading = withIconFontFallbacks('monospace, user mono')
    expect(leading.indexOf('"Symbols Nerd Font Mono"')).toBeLessThan(leading.indexOf('monospace'))
    expect(leading.indexOf('"Hack Nerd Font Mono"')).toBeGreaterThan(leading.indexOf('monospace'))
  })

  it('keeps quoted names, parentheses, and escaped quotes whole', () => {
    const stack = withIconFontFallbacks('"Weird, Name", local("a\\"b"), monospace')
    expect(stack.startsWith('"Weird, Name", local("a\\"b"), ')).toBe(true)
  })
})

describe('terminal font — generic terminator', () => {
  it('adds monospace to a stack without a generic', () => {
    expect(withMonospaceFallback('user mono, "Another Mono"')).toBe('user mono, "Another Mono", monospace')
  })

  it('leaves a stack that already ends in a generic alone', () => {
    expect(withMonospaceFallback('user mono, monospace')).toBe('user mono, monospace')
  })

  it('replaces an empty stack with the built-in one', () => {
    expect(withMonospaceFallback('')).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
  })

  it('replaces a lone CSS-wide keyword with the built-in stack', () => {
    expect(withMonospaceFallback('inherit')).toBe(DEFAULT_TERMINAL_FONT_FAMILY)
  })
})

describe('terminal font — size', () => {
  it('clamps into the declared range and rounds', () => {
    expect(clampTerminalFontSize(TERMINAL_FONT_SIZE_MIN - 4)).toBe(TERMINAL_FONT_SIZE_MIN)
    expect(clampTerminalFontSize(TERMINAL_FONT_SIZE_MAX + 4)).toBe(TERMINAL_FONT_SIZE_MAX)
    expect(clampTerminalFontSize(15.6)).toBe(16)
  })
})

describe('terminal font — resolution', () => {
  it('uses the configured family and size', () => {
    const resolved = resolveTerminalFont('User Mono', 15)
    expect(resolved.fontFamily.startsWith('User Mono, ')).toBe(true)
    expect(resolved.fontSize).toBe(15)
  })

  it('falls back to the built-in stack for an unset or whole-value keyword family', () => {
    for (const family of ['', '   ', 'unset']) {
      const resolved = resolveTerminalFont(family, 13).fontFamily
      // The built-in stack opens with a generic, so every entry survives and
      // only the symbols-only patches may precede them.
      for (const entry of DEFAULT_TERMINAL_FONT_FAMILY.split(', ')) expect(resolved).toContain(entry)
      expect(resolved).toContain('"Symbols Nerd Font Mono"')
    }
  })

  it('clamps the resolved size', () => {
    expect(resolveTerminalFont('', TERMINAL_FONT_SIZE_MAX + 100).fontSize).toBe(TERMINAL_FONT_SIZE_MAX)
  })
})
