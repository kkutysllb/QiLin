/** Sidebar shell style contracts shared with its slot-owned controls. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SidebarRoot.module.css', import.meta.url)), 'utf8')

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

/**
 * The stylesheet with every complete `@media (hover: hover)` block removed.
 * @param source - the sheet's text.
 * @returns the remaining rules, with those blocks' bodies dropped by brace depth.
 */
function withoutHoverMedia(source: string): string {
  let result = ''
  let index = 0
  for (;;) {
    const start = source.indexOf('@media (hover: hover)', index)
    if (start === -1) return result + source.slice(index)
    result += source.slice(index, start)
    let depth = 0
    let cursor = source.indexOf('{', start)
    for (; cursor < source.length; cursor++) {
      if (source[cursor] === '{') depth++
      else if (source[cursor] === '}' && --depth === 0) break
    }
    index = cursor + 1
  }
}

describe('SidebarRoot.module.css', () => {
  it('shares and cancels the wide shell trailing padding structurally', () => {
    const root = declarations('.root')
    expect(root?.get('--qilin-sidebar-inline-padding')).toBe('8px')
    expect(root?.get('--qilin-sidebar-row-padding')).toBe('12px')
    expect(root?.get('--qilin-sidebar-label-gap')).toBe('6px')
    expect(root?.get('--qilin-sidebar-paint-inset')).toBe('3px')
    expect(root?.get('padding')).toBe('6px var(--qilin-sidebar-inline-padding)')
    expect(declarations('.regionArea')?.get('margin-left')).toBe('-4px')
    expect(declarations('.regionArea')?.get('padding-left')).toBe('4px')
    expect(declarations('.regionArea')?.get('margin-right')).toBe(
      'calc(-1 * var(--qilin-sidebar-inline-padding))',
    )
    expect(declarations('.collapsed .regionArea')?.get('margin-left')).toBe('0')
    expect(declarations('.collapsed .regionArea')?.get('padding-left')).toBe('0')
    expect(declarations('.collapsed .regionArea')?.get('margin-right')).toBe('0')
  })

  it('keeps the reviewed expanded spacing separate from rail and caption controls', () => {
    expect(declarations('.logoRow')?.get('padding')).toBe('8px 0 8px 8px')
    expect(declarations('.logoRow')?.get('margin-bottom')).toBe('0')
    expect(declarations('.newSession')?.get('margin')).toBe('0 calc(var(--qilin-sidebar-paint-inset) + 1px) 10px')
    expect(declarations(":global(html[data-platform='darwin']:not([data-fullscreen])) .root:not(.collapsed) > .topStrip > .toggle")?.get('transform')).toBe('translateX(4px)')
    expect(css).not.toContain(':not(.fading)')
    expect(declarations(':global([data-windows-titlebar]) .root:not(.collapsed) .brand')?.get('padding-left')).toBe('8px')
    expect(declarations(':global([data-windows-titlebar]) .root:not(.collapsed) .newSession')?.get('margin-top')).toBe('6px')
    expect(declarations(':global([data-windows-titlebar]) .root:not(.collapsed) .newSession')?.get('margin-left')).toBe('calc(var(--qilin-sidebar-paint-inset) + 1px)')
    expect(declarations(':global([data-fullscreen]) .topStrip')?.get('justify-content')).toBe('flex-start')
    expect(declarations('.topStrip')?.get('padding')).toBe('0 12px 2px')
    expect(declarations('.topStrip')?.get('height')).toBe('52px')
    expect(declarations('.root.collapsed')?.get('padding')).toBe('18px 10px 6px')
  })

  it('paints the panel rows on a 3px inset that the rail drops', () => {
    const row = declarations('.panelRow')
    expect(row?.get('gap')).toBe('var(--qilin-sidebar-label-gap)')
    expect(row?.get('margin')).toBe('0')
    expect(row?.get('padding')).toBe('7px calc(var(--qilin-sidebar-row-padding) - var(--qilin-sidebar-paint-inset))')
    expect(row?.get('border-inline')).toBe('var(--qilin-sidebar-paint-inset) solid transparent')
    expect(row?.get('background-clip')).toBe('padding-box')
    // The 36px rail control keeps its width: no paint inset narrows it there.
    expect(declarations('.collapsed .panelRow')?.get('border-inline')).toBe('0')
    expect(declarations('.collapsed .panelRow')?.get('background-clip')).toBe('border-box')
  })

  it('gates every hover affordance behind a hover-capable input', () => {
    // Touch and pen inputs would otherwise keep the wash after a tap: every
    // hover selector opens inside a hover media block, never in the bare sheet.
    expect(css).toContain(':hover')
    expect(withoutHoverMedia(css)).not.toContain(':hover')
  })

  it('moves the four upper controls while the settings seat only fades', () => {
    const animation = 'rail-in 150ms var(--ds-ease-in-out) backwards'
    for (const selector of [
      '.railIn .iconButton',
      '.railIn .newSession',
      '.railIn .regionArea',
    ]) {
      expect(declarations(selector)?.get('animation')).toBe(animation)
    }
    expect(declarations('.railIn .footArea')?.get('animation')).toBe(
      'rail-fade-in 150ms var(--ds-ease-in-out) backwards',
    )
    expect(css).toMatch(
      /@keyframes rail-in\s*\{\s*from\s*\{\s*opacity: 0;\s*transform: translateX\(49px\);\s*}\s*}/,
    )
    expect(css).toMatch(/@keyframes rail-fade-in\s*\{\s*from\s*\{\s*opacity: 0;\s*}\s*}/)
  })

  it('gives shell rail controls the same base anchor for their shared translation', () => {
    expect(declarations('.collapsed .logoRow')?.get('justify-content')).toBe('flex-start')
    expect(declarations('.collapsed .newSession')?.get('align-self')).toBe('flex-start')
    expect(declarations('.collapsed .newSession')?.get('width')).toBe('36px')
  })

  it('keeps New Session the elevated card control', () => {
    // The shipped card: an elevated fill behind a hairline border with a
    // centered label, deepening one step on hover. A plain row whose hover
    // adds a wash is the style this pins against.
    const card = declarations('.newSession')
    expect(card?.get('background')).toBe('var(--qilin-alias-button-elevated-fill)')
    expect(card?.get('border')).toBe('1px solid var(--qilin-alias-border-l3)')
    expect(card?.get('justify-content')).toBe('center')
    expect(card?.get('height')).toBe('38px')
    expect(declarations('.newSession:hover')?.get('background-color')).toBe('var(--qilin-alias-button-floating-hover)')
    expect(declarations('.collapsed .newSession')?.get('border-color')).toBe('transparent')
  })

  it('keeps the slotted brand row at the full artwork height', () => {
    expect(declarations('.brandIdentity')?.get('height')).toBe('24px')
    expect(declarations('.brandName')?.get('height')).toBe('24px')
    expect(declarations('.brandName')?.get('line-height')).toBe('24px')
    expect(declarations('.brandName')?.get('font-size')).toBe('18px')
    expect(declarations('.fallbackBrandName')?.get('font-size')).toBe('17px')
    expect(declarations('.fallbackBrandName')?.get('white-space')).toBe('nowrap')
  })

  it('flows the build badge beside the wordmark instead of clipping it', () => {
    // An absolutely positioned badge is clipped by the brand button's
    // `overflow: hidden`; the chip is an in-flow superscript of the wordmark.
    expect(declarations('.buildBadge')?.get('position')).toBeUndefined()
    expect(declarations('.buildBadge')?.get('align-self')).toBe('flex-start')
    expect(declarations('.buildBadge')?.get('font-size')).toBe('10px')
    expect(declarations('.buildBadge')?.get('white-space')).toBe('nowrap')
    expect(declarations('.brandName')?.get('gap')).toBe('6px')
  })
})
