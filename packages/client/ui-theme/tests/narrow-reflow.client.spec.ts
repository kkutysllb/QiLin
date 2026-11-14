/**
 * Narrow-viewport reflow of the settings rows: the appearance cubes share one
 * row, the font rows drop their wide gutters, and the font-family fields stop
 * claiming a fixed basis. jsdom has no layout, so each contract is read from
 * the sheet's at-rule blocks; the 390px budget is arithmetic over those values.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { atRuleBlock, parseRules } from './stylesheet-scan.ts'

/** Widest viewport the narrow rules cover. */
const NARROW = '@media (max-width: 767px)'

/** Pointer-precision rule the font-family inputs grow under. */
const COARSE = '@media (pointer: coarse)'

/** The sheet beside this spec's package, as text. */
function sheet(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/client/${name}`, import.meta.url)), 'utf8')
}

/**
 * Declarations of one exact selector inside one at-rule's block.
 * @param css - the stylesheet text.
 * @param rule - the at-rule prelude, without its opening brace.
 * @param selector - exact selector text inside that block.
 * @returns the declarations keyed by property, or undefined when either is absent.
 */
function inRule(css: string, rule: string, selector: string): Map<string, string> | undefined {
  const block = atRuleBlock(css, rule)
  if (block === undefined) return undefined
  for (const parsed of parseRules(css.slice(block.start + 1, block.end))) {
    if (!parsed.selectors.includes(selector)) continue
    return new Map(parsed.declarations)
  }
  return undefined
}

describe('appearance row at a narrow width', () => {
  const css = sheet('AppearanceRow.module.css')

  it('shares one segmented border across the three theme options', () => {
    const row = parseRules(css).find(rule => rule.selectors.includes('.cubeRow'))?.declarations
    expect(row).toContainEqual(['display', 'inline-flex'])
    expect(row).toContainEqual(['gap', '2px'])
    expect(row).toContainEqual(['border', '1px solid var(--qilin-alias-border-l2)'])
    const cube = parseRules(css).find(rule => rule.selectors.includes('.themeCube'))?.declarations
    expect(cube).toContainEqual(['border', '0'])
    expect(cube).toContainEqual(['padding', '4px 10px'])
  })

  it('stacks the label above the controls below the 900px breakpoint', () => {
    const group = inRule(css, '@media (max-width: 900px)', '.group')
    expect(group?.get('grid-template-columns')).toBe('minmax(0, 1fr)')
    const controls = inRule(css, '@media (max-width: 900px)', '.controls')
    expect(controls?.get('align-items')).toBe('flex-start')
  })
})

describe('font rows at a narrow width', () => {
  const css = sheet('FontSizeRow.module.css')

  it('narrows the wide-row gutter beside a stepper and stacks the stacked rows', () => {
    const text = inRule(css, NARROW, ":global(html:not([data-windows-titlebar]):not([data-platform='darwin'])) .row:not(.stacked) .rowText")
    expect(text?.get('padding-right')).toBe('16px')
    const stacked = inRule(css, NARROW, '.stacked')
    expect(stacked?.get('flex-direction')).toBe('column')
    expect(stacked?.get('align-items')).toBe('stretch')
    const stackedText = inRule(css, NARROW, '.stacked .rowText')
    expect(stackedText?.get('flex')).toBe('none')
    expect(stackedText?.get('padding-right')).toBe('0')
  })

  it('keeps the wide 48px gutter outside the narrow rule', () => {
    const row = parseRules(css).find(rule => rule.selectors.includes('.rowText'))
    expect(row?.declarations).toContainEqual(['padding-right', '48px'])
  })

  it('reveals the stepper arrows on a touch pointer instead of hover', () => {
    // A coarse pointer never hovers; the arrows would otherwise stay at opacity 0.
    expect(inRule(css, '@media (hover: none)', '.arrows')?.get('opacity')).toBe('1')
    expect(inRule(css, '@media (hover: hover)', '.stepper:hover .arrows')?.get('opacity')).toBe('1')
  })
})

describe('font-family fields at a narrow width and on a coarse pointer', () => {
  const css = sheet('FontFamilyRow.module.css')

  it('drops the fixed field basis so the fields share the row', () => {
    expect(parseRules(css).find(rule => rule.selectors.includes('.field'))?.declarations).toContainEqual(['flex', '0 1 240px'])
    expect(inRule(css, NARROW, '.field')?.get('flex-basis')).toBe('auto')
  })

  it('raises the field text to the 16px a coarse pointer needs', () => {
    // A smaller input font lets iOS zoom the page on focus.
    expect(inRule(css, COARSE, '.field input')?.get('font-size')).toBe('16px')
  })
})
