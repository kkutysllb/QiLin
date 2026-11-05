/**
 * The dsh-era compat aliases in dsw-compat.css resolve to tokens the theme
 * sheets define. A compat alias whose target has no definition computes to
 * nothing, so a stylesheet reading it paints no color and blurs nothing — the
 * failure mode the menu material hit when its fill and blur tokens were renamed
 * to unused upstream names.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRules } from './stylesheet-scan.ts'

/** Stylesheet directory the theme package owns. */
const STYLES_DIR = fileURLToPath(new URL('../src/styles/', import.meta.url))

/**
 * Compat aliases with no token definition in this client. Most are upstream
 * vocabulary this palette never carried; `--qilin-hovercard-bg` is owned by the
 * ui-primitives hover card sheet, and `--qilin-specific-brand-seal-fill` by the
 * skin pack. The resolution assertion fails when this set changes, so a new
 * entry here is a decision rather than a place to silence a missing token.
 */
const UNRESOLVED_COMPAT_TARGETS = [
  '--qilin-alias-bg',
  '--qilin-alias-bg-l1',
  '--qilin-alias-bg-l2',
  '--qilin-alias-bg-layer-0',
  '--qilin-alias-bg-layer-4',
  '--qilin-alias-border-l',
  '--qilin-alias-fg',
  '--qilin-alias-fill-l1',
  '--qilin-alias-fill-l2',
  '--qilin-alias-fill-tertiary',
  '--qilin-alias-fill-tsp-secondary',
  '--qilin-alias-interactive-bg-default',
  '--qilin-alias-label-error',
  '--qilin-alias-label-quaternary',
  '--qilin-alias-menu-icon',
  '--qilin-alias-scrim',
  '--qilin-alias-separator-primary',
  '--qilin-alias-state-business-primary-weak',
  '--qilin-alias-state-warning-primary',
  '--qilin-alias-surface-raised',
  '--qilin-alias-text-1',
  '--qilin-alias-text-2',
  '--qilin-alias-text-3',
  '--qilin-alias-text-link',
  '--qilin-alias-text-primary',
  '--qilin-color-bg-accent',
  '--qilin-color-bg-accent-subtle',
  '--qilin-color-bg-primary',
  '--qilin-color-bg-subtle',
  '--qilin-color-border-accent',
  '--qilin-color-border-primary',
  '--qilin-color-text-accent',
  '--qilin-color-text-accent-contrast',
  '--qilin-color-text-primary',
  '--qilin-color-text-secondary',
  '--qilin-font',
  '--qilin-font-mono',
  '--qilin-font-size-sm',
  '--qilin-font-size-xs',
  '--qilin-font-sm-13',
  '--qilin-font-xs-12',
  '--qilin-font-xs-strong-12',
  '--qilin-hovercard-bg',
  '--qilin-space-1',
  '--qilin-space-2',
  '--qilin-space-3',
  '--qilin-specific-brand-seal-fill',
]

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
 * Custom properties every shipped theme sheet defines.
 * @returns the defined token names.
 */
function definedTokens(): Set<string> {
  const defined = new Set<string>()
  for (const name of readdirSync(STYLES_DIR).filter(file => file.endsWith('.css'))) {
    const css = readFileSync(join(STYLES_DIR, name), 'utf8')
    for (const [, token = ''] of css.matchAll(/(--qilin-[\w-]+)\s*:/g)) defined.add(token)
  }
  return defined
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
