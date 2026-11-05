// @vitest-environment jsdom
/**
 * The shared menu material takes its fill and blur from theme-owned tokens, and
 * its transition durations arrive through the runtime style the component
 * writes. A material token with no definition computes to nothing, leaving every
 * menu that mounts this surface fully transparent.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MENU_TRANSITION_MS, MenuSurface } from '../src/MenuSurface.tsx'

afterEach(() => { cleanup() })

/** Theme stylesheets that own the tokens the material resolves through. */
const STYLES_DIR = resolve(import.meta.dirname, '../../ui-theme/src/styles')

/**
 * Every `--dsw-X: var(--qilin-Y)` alias the theme's compat sheet declares.
 * @returns alias name to the token it resolves to.
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
 * Declarations of the sheet's `.material` rule.
 * @param css - stylesheet text.
 * @returns property to value, in source order.
 */
function materialDeclarations(css: string): Map<string, string> {
  const body = /\.material\s*\{([^}]*)\}/.exec(css)?.[1]
  if (body === undefined) throw new Error('MenuSurface.module.css has no .material rule')
  return new Map(body.split(';')
    .map(part => part.trim())
    .filter(part => part.includes(':'))
    .map((part): [string, string] => {
      const colon = part.indexOf(':')
      return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()]
    }))
}

describe('menu surface material', () => {
  it('renders the material layer and injects the transition durations', () => {
    const view = render(<MenuSurface role="menu"><span>Item</span></MenuSurface>)
    const surface = view.getByRole('menu')
    expect(surface.dataset.menuMaterial).toBe('translucent')
    expect(surface.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(surface.style.getPropertyValue('--dsh-menu-enter')).toBe(`${MENU_TRANSITION_MS.enter}ms`)
    expect(surface.style.getPropertyValue('--dsh-menu-dismiss')).toBe(`${MENU_TRANSITION_MS.dismiss}ms`)
    expect(surface.style.getPropertyValue('--dsh-menu-replace')).toBe(`${MENU_TRANSITION_MS.replace}ms`)
    expect(document.querySelector('[data-menu-backing]')).not.toBeNull()
  })

  it('paints its fill and blur from tokens a theme sheet defines', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../src/MenuSurface.module.css'), 'utf8')
    const aliases = compatAliases()
    const defined = definedTokens()
    const declarations = materialDeclarations(css)
    for (const property of ['background', 'backdrop-filter']) {
      const value = declarations.get(property)
      if (value === undefined) throw new Error(`The menu material declares no ${property}`)
      const references = [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, token = '']) => token)
      // Theme ownership is the contract: an empty reference set would mean a
      // literal color that ignores both schemes and every skin.
      expect(references.length, property).toBeGreaterThan(0)
      for (const token of references) {
        const target = aliases.get(token) ?? token
        expect(defined.has(target), `${property} ${token} -> ${target}`).toBe(true)
      }
    }
  })
})
