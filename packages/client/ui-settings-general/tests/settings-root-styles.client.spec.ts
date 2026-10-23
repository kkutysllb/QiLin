/**
 * Settings shell style contracts with the desktop window chrome: the
 * full-window overlay opens below a self-drawn titlebar, so the rail head does
 * not sit under the window menu.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SettingsRoot.module.css', import.meta.url)), 'utf8')

/** Declarations of one exact selector, keyed by property. */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('SettingsRoot.module.css overlay', () => {
  it('fills the viewport and clears the caption height a self-drawn titlebar publishes', () => {
    const overlay = declarations('.overlay')
    expect(overlay?.get('position')).toBe('fixed')
    expect(overlay?.get('inset')).toBe('0')
    expect(overlay?.get('top')).toBe(
      'var(--qilin-windows-titlebar-height, var(--dsh-windows-titlebar-height, var(--ok-tb-h, 0px)))',
    )
  })
})
