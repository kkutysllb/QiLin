/**
 * Terminal font resolution: the user's font preference turned into the xterm
 * options. Pure string and number math (no DOM, no xterm), so the fallback
 * chain and the clamping are unit-testable without mounting a terminal.
 */

/** The stack xterm measures with when neither the user nor the theme names one. */
export const DEFAULT_TERMINAL_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/** Smallest terminal font size a preference may resolve to, in CSS pixels. */
export const TERMINAL_FONT_SIZE_MIN = 8

/** Largest terminal font size a preference may resolve to, in CSS pixels. */
export const TERMINAL_FONT_SIZE_MAX = 32

/**
 * Icon fonts appended to whichever base stack wins, so a shell prompt that
 * draws glyphs from the Nerd Font Private Use Areas resolves to a real glyph
 * instead of the missing-glyph box.
 *
 * Chromium's implicit system fallback covers the BMP Private Use Area
 * (U+E000–U+F8FF, where the powerline separators live) but not the
 * supplementary-plane PUA-B (U+F0000+), where Nerd Fonts v3 moved the
 * Material Design set; naming the families makes the browser consult them per
 * character, covering both planes.
 *
 * Color-emoji families are deliberately absent: Chromium already routes
 * genuine emoji through its own fallback, and putting a color font ahead of
 * the generic family would capture BMP symbols the prompt expects in
 * monospace (U+26A0, U+2714) as wide color glyphs that break the cell grid.
 *
 * The symbols-only patches come first because they ship glyphs without Latin
 * and so can never hijack ASCII metrics; the fully patched distributions
 * follow for users who installed one of those instead. Both the `… Mono` and
 * proportional family names are listed, because the installers register them
 * as distinct families.
 *
 * These are strictly appended: xterm derives its cell metrics from the first
 * entry, so the base font must stay in front.
 */
export const ICON_FONT_FALLBACKS: readonly string[] = [
  '"Symbols Nerd Font Mono"',
  '"Symbols Nerd Font"',
  '"Hack Nerd Font Mono"',
  '"Hack Nerd Font"',
  '"JetBrainsMono Nerd Font Mono"',
  '"JetBrainsMono Nerd Font"',
  '"FiraCode Nerd Font Mono"',
  '"FiraCode Nerd Font"',
  '"CaskaydiaCove Nerd Font Mono"',
  '"CaskaydiaCove Nerd Font"',
  '"SauceCodePro Nerd Font Mono"',
  '"UbuntuMono Nerd Font Mono"',
  '"Iosevka Nerd Font Mono"',
  '"MesloLGS Nerd Font Mono"',
  '"MesloLGS NF"',
]

/** How many leading {@link ICON_FONT_FALLBACKS} carry no Latin glyphs at all. */
const SYMBOLS_ONLY_COUNT = 2

/**
 * CSS generic families: each always resolves, so an icon font spliced after
 * one would never be consulted.
 */
const GENERIC_FAMILIES = new Set([
  'monospace', 'serif', 'sans-serif', 'cursive', 'fantasy',
  'system-ui', 'ui-monospace', 'ui-serif', 'ui-sans-serif', 'ui-rounded',
  'math', 'emoji', 'fangsong',
])

/** CSS-wide keywords, valid only as a whole declaration value. */
const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer'])

/**
 * Split a CSS font-family stack into its entries, keeping quoted names and
 * parenthesized groups whole.
 * @param stack - a CSS font-family value.
 * @returns the trimmed, non-empty entries in source order.
 */
function splitFamilies(stack: string): string[] {
  const entries: string[] = []
  let buffer = ''
  let quote: string | null = null
  let depth = 0
  for (let i = 0; i < stack.length; i += 1) {
    const character = stack[i] as string
    if (quote !== null) {
      // Escapes are copied verbatim so an escaped quote does not close it.
      if (character === '\\' && i + 1 < stack.length) {
        buffer += character + (stack[i + 1] as string)
        i += 1
        continue
      }
      buffer += character
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      buffer += character
      continue
    }
    if (character === '(') depth += 1
    else if (character === ')') depth = Math.max(0, depth - 1)
    else if (character === ',' && depth === 0) {
      entries.push(buffer)
      buffer = ''
      continue
    }
    buffer += character
  }
  entries.push(buffer)
  return entries.map(entry => entry.trim()).filter(entry => entry !== '')
}

/**
 * Normalize one family name for comparison.
 * @param family - one stack entry.
 * @returns the name unquoted, with runs of whitespace collapsed and case folded.
 */
function normalizeFamily(family: string): string {
  return family
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Clamp a font size into the range the terminal accepts.
 * @param value - the requested size in CSS pixels.
 * @returns the nearest whole size inside the range.
 */
export function clampTerminalFontSize(value: number): number {
  return Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, Math.round(value)))
}

/**
 * Append {@link ICON_FONT_FALLBACKS} to a stack, keeping the caller's entries
 * and order.
 *
 * A family the stack already names is not repeated, so a user who lists their
 * own Nerd Font keeps that priority; the additions are spliced in ahead of the
 * first generic family, because a generic always resolves. A stack that opens
 * with a generic is the exception: only the symbols-only patches may precede
 * it, since a fully patched Nerd Font there would become xterm's measuring
 * base and override the requested family. Re-applying is a no-op, which lets a
 * caller diff the result against the live options.
 * @param stack - a CSS font-family stack, base font first.
 * @returns the stack with icon fallbacks merged in.
 */
export function withIconFontFallbacks(stack: string): string {
  const entries = splitFamilies(stack)
  if (entries.length === 0) return ICON_FONT_FALLBACKS.join(', ')

  const present = new Set(entries.map(normalizeFamily))
  const missing = (family: string): boolean => !present.has(normalizeFamily(family))
  const symbolsOnly = ICON_FONT_FALLBACKS.slice(0, SYMBOLS_ONLY_COUNT).filter(missing)
  const patched = ICON_FONT_FALLBACKS.slice(SYMBOLS_ONLY_COUNT).filter(missing)
  if (symbolsOnly.length === 0 && patched.length === 0) return entries.join(', ')

  const firstGeneric = entries.findIndex(entry => GENERIC_FAMILIES.has(normalizeFamily(entry)))
  const cut = firstGeneric === -1 ? entries.length : firstGeneric
  if (cut === 0) {
    return [...symbolsOnly, entries[0] as string, ...patched, ...entries.slice(1)].join(', ')
  }
  return [...entries.slice(0, cut), ...symbolsOnly, ...patched, ...entries.slice(cut)].join(', ')
}

/**
 * Reduce one link of the base-family chain to a usable stack.
 * @param value - the candidate, which may be empty or a whole-value keyword.
 * @returns the value to use, or an empty string when the next link should win.
 */
function usableBase(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (CSS_WIDE_KEYWORDS.has(trimmed.toLowerCase())) return ''
  return trimmed
}

/**
 * Guarantee a stack ends in a generic family.
 *
 * A stack of names the browser cannot resolve would otherwise fall through to
 * the browser's standard font, which is proportional; xterm then measures its
 * cell from a proportional advance and the grid breaks rather than merely
 * losing the requested typeface. This does not sniff whether the named
 * families exist — only that the stack terminates — and a stack that already
 * names a generic is returned untouched.
 * @param stack - the resolved font-family value.
 * @returns the stack, ending in a generic family.
 */
export function withMonospaceFallback(stack: string): string {
  const families = splitFamilies(stack)
  if (families.length === 0) return DEFAULT_TERMINAL_FONT_FAMILY
  const only = families.length === 1 ? families[0] : undefined
  if (only !== undefined && CSS_WIDE_KEYWORDS.has(only.toLowerCase())) return DEFAULT_TERMINAL_FONT_FAMILY
  if (families.some(family => GENERIC_FAMILIES.has(family.toLowerCase()))) return families.join(', ')
  return `${families.join(', ')}, monospace`
}

/**
 * Resolve the xterm font options for one preference.
 *
 * The base family keeps its precedence — the user's own family, then the
 * built-in stack — and is then terminated with a generic family and topped up
 * with the icon fallbacks.
 * @param fontFamily - the user's preferred family, empty when unset.
 * @param fontSize - the user's preferred size, in CSS pixels.
 * @returns the `fontFamily` and `fontSize` xterm options.
 */
export function resolveTerminalFont(
  fontFamily: string,
  fontSize: number,
): { fontFamily: string; fontSize: number } {
  const base = usableBase(fontFamily) || DEFAULT_TERMINAL_FONT_FAMILY
  return {
    fontFamily: withIconFontFallbacks(withMonospaceFallback(base)),
    fontSize: clampTerminalFontSize(fontSize),
  }
}
