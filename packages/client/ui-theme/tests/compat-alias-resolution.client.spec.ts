/**
 * The dsh-era compat aliases in dsw-compat.css resolve to tokens the theme
 * sheets define. A compat alias whose target has no definition computes to
 * nothing, so a stylesheet reading it paints no color and blurs nothing — the
 * failure mode the menu material hit when its fill and blur tokens were renamed
 * to unused upstream names.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRules } from './stylesheet-scan.ts'
import { programTokens, themeTokens } from './token-resolution.ts'

/** Stylesheet directory the theme package owns. */
const STYLES_DIR = fileURLToPath(new URL('../src/styles/', import.meta.url))

/**
 * Compat aliases with no resolvable target. Empty by contract: the compat sheet
 * mirrors the dsh-era vocabulary, so every alias must land on a token the
 * palette sheets define or a client program injects. A new entry here is a
 * missing definition, not a place to silence one.
 */
const UNRESOLVED_COMPAT_TARGETS: readonly string[] = []

/**
 * Every `--dsw-X: var(--qilin-Y)` alias the compat sheet declares.
 * @returns alias name to the token it resolves to, in source order.
 */
function compatAliases(): Map<string, string> {
  const css = readFileSync(join(STYLES_DIR, 'dsw-compat.css'), 'utf8')
  return new Map([...css.matchAll(/--dsw-([\w-]+)\s*:\s*var\(\s*(--qilin-[\w-]+)\s*\)/g)]
    .map(([, alias = '', target = '']): [string, string] => [`--dsw-${alias}`, target]))
}

/**
 * Custom properties the theme sheets define plus the ones client programs
 * inject, such as the brand pack's skin tokens.
 * @returns the resolvable token names.
 */
function definedTokens(): Set<string> {
  return new Set([...themeTokens(), ...programTokens()])
}

/**
 * Merge each selector's declarations across every rule naming it.
 * @param css - stylesheet text.
 * @returns declarations keyed by selector, then by property.
 */
function declarationsBySelector(css: string): Map<string, Map<string, string>> {
  const bySelector = new Map<string, Map<string, string>>()
  for (const rule of parseRules(css)) {
    const [selector] = rule.selectors
    if (selector === undefined || rule.selectors.length !== 1) continue
    const declarations = bySelector.get(selector) ?? new Map<string, string>()
    for (const [property, value] of rule.declarations) declarations.set(property, value)
    bySelector.set(selector, declarations)
  }
  return bySelector
}

describe('compat alias resolution', () => {
  it('maps every alias to a token a theme sheet defines', () => {
    const defined = definedTokens()
    const unresolved = [...new Set(compatAliases().values())]
      .filter(token => !defined.has(token))
      .sort()
    expect(unresolved).toEqual(UNRESOLVED_COMPAT_TARGETS)
  })
})

describe('menu glass tokens', () => {
  it('paints the shared menu material through scheme-specific fills and one blur', () => {
    const aliases = compatAliases()
    expect(aliases.get('--dsw-menu-surface-fill')).toBe('--qilin-menu-surface-fill')
    expect(aliases.get('--dsw-menu-backdrop-filter')).toBe('--qilin-menu-backdrop-filter')

    const platform = declarationsBySelector(readFileSync(join(STYLES_DIR, 'design-platform.css'), 'utf8'))
    expect(platform.get('body')?.get('--qilin-menu-surface-fill')).toBe('rgba(252, 253, 254, 0.7)')
    expect(platform.get('body[data-ds-dark-theme]')?.get('--qilin-menu-surface-fill'))
      .toBe('rgba(48, 49, 54, 0.64)')

    const gradient = declarationsBySelector(readFileSync(join(STYLES_DIR, 'gradient-shadow-text.css'), 'utf8'))
    expect(gradient.get('body')?.get('--qilin-menu-backdrop-filter')).toBe('blur(40px) saturate(150%)')
  })
})

describe('file-diff, done-state, and violet vocabulary', () => {
  it('resolves the compat aliases and keeps the forge sheets on the palette spelling', () => {
    const aliases = compatAliases()
    const defined = definedTokens()
    for (const part of ['added-bg', 'added-gutter', 'added-marker', 'deleted-bg', 'deleted-gutter', 'deleted-marker']) {
      const alias = `--dsw-alias-file-diff-${part}`
      expect(aliases.get(alias)).toBe(`--qilin-alias-file-diff-${part}`)
      expect(defined.has(`--qilin-alias-file-diff-${part}`)).toBe(true)
    }
    expect(aliases.get('--dsw-alias-state-done-primary')).toBe('--qilin-alias-state-done-primary')
    expect(aliases.get('--dsw-static-violet-400')).toBe('--qilin-static-violet-400')
    expect(defined.has('--qilin-static-violet-400')).toBe(true)

    // The ported forge sheets read the palette spelling directly; the compat
    // aliases stay a compatibility surface for dsh-era plugin sheets.
    const changes = readFileSync(new URL('../../../experimental/client-ui-forge/src/client/ChangesTab.module.css', import.meta.url), 'utf8')
    expect(changes).toContain('var(--qilin-alias-file-diff-added-bg)')
    expect(changes).not.toContain('--dsw-alias-file-diff-')
    const forge = readFileSync(new URL('../../../experimental/client-ui-forge/src/client/ForgeTab.module.css', import.meta.url), 'utf8')
    expect(forge).toContain('var(--qilin-alias-state-done-primary)')
    expect(forge).not.toContain('--dsw-alias-state-done-primary')
    const sessions = readFileSync(new URL('../../../experimental/client-ui-forge/src/client/SessionList.module.css', import.meta.url), 'utf8')
    expect(sessions).not.toContain('--dsw-static-violet-400')
  })
})
