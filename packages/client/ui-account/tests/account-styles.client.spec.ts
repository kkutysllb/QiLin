/**
 * Account control style contract: the footer row fills the wide column rather
 * than hugging its trailing edge, and the avatar keeps one geometry in both
 * column states.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AccountMenu.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
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

describe('AccountMenu.module.css', () => {
  it('lays the account row across the footer instead of pinning it to the right edge', () => {
    expect(declarations('.slot')?.get('width')).toBe('100%')
    expect(declarations('.slot')?.get('justify-content')).toBeUndefined()
    expect(declarations('.trigger')?.get('width')).toBe('100%')
    expect(declarations('.trigger')?.get('text-align')).toBe('left')
  })

  it('keeps the rail control round and the account name truncatable', () => {
    expect(declarations('.trigger.rail')?.get('width')).toBe('36px')
    expect(declarations('.trigger.rail')?.get('height')).toBe('36px')
    expect(declarations('.trigger.rail')?.get('border-radius')).toBe('50%')
    expect(declarations('.name')?.get('text-overflow')).toBe('ellipsis')
    expect(declarations('.name')?.get('min-width')).toBe('0')
    expect(declarations('.avatar')?.get('width')).toBe('22px')
    expect(declarations('.avatar')?.get('border-radius')).toBe('50%')
  })
})
