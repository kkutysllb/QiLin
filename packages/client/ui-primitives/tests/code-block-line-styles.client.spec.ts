/**
 * The conversation code block's line-level wash, asserted against
 * CodeBlock.module.css on disk: the highlight is a background on one source
 * line, it appears only behind a hover-capable pointer, and the fade is
 * dropped under reduced motion. The hover state itself cannot be evaluated in
 * jsdom, so the declarations are the contract here and the rendered arm is
 * covered beside this file.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/markdown/CodeBlock.module.css', import.meta.url)), 'utf8')

/** The selector the wash and its fade are declared on. */
const LINE = '.block :where(pre) code > :global(.line)'

/** The document position inside the hover media block where the wash opens. */
const HOVER = '@media (hover: hover)'

/**
 * One exact rule's declarations.
 * @param selector - exact selector text.
 * @returns declarations keyed by property, or undefined when the rule is absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(part => part.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
    }
    return found
  }
  return undefined
}

/**
 * Every rule the sheet declares, flattened.
 * @returns selector parts and declarations per rule, in source order.
 */
function allRules(): { selectors: string[]; properties: string[] }[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  return [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectorList = '', body = '']) => ({
    selectors: selectorList.split(',').map(part => part.trim()),
    properties: body.split(';').map(part => part.trim()).filter(part => part.includes(':'))
      .map(part => part.slice(0, part.indexOf(':')).trim()),
  }))
}

describe('code block line highlight', () => {
  it('paints the hovered source line only behind a hover-capable pointer', () => {
    const media = css.indexOf(HOVER)
    const wash = css.indexOf(`${LINE}:hover`)
    expect(media).toBeGreaterThan(-1)
    expect(wash).toBeGreaterThan(media)
    // Nothing closes between the media prelude and the wash: the wash is inside it.
    expect(css.slice(media, wash)).not.toContain('}')
    expect(declarations(`${LINE}:hover`)?.get('background-color'))
      .toBe('var(--qilin-alias-interactive-bg-hover)')
  })

  it('fades the wash in and drops the fade under reduced motion', () => {
    expect(declarations(LINE)?.get('transition')).toBe('background-color 120ms ease')
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.block :where\(pre\) code > :global\(\.line\) \{\s*transition: none;/,
    )
  })

  it('declares nothing on a line but the wash itself', () => {
    // No line rule may claim selection or pointer behavior: the wash must leave
    // text selection, copying, and horizontal scrolling alone.
    for (const rule of allRules().filter(entry => entry.selectors.some(selector => selector.includes('(\\.line')))) {
      for (const property of rule.properties) {
        expect(['background-color', 'border-radius', 'transition']).toContain(property)
      }
    }
  })

  it('keeps the gutter counter as the sheet\'s only unselectable text', () => {
    const selection = allRules().filter(rule => rule.properties.includes('user-select'))
    expect(selection).toHaveLength(1)
    expect(selection[0]?.selectors).toEqual(['.numbered :where(pre) code > :global(.line)::before'])
  })
})
