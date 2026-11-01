/**
 * WorkspaceBrowser spacing contract, asserted against the CSS text on disk:
 * row fills share the shell's trailing inset, the stable scrollbar counts
 * inside it, and flat, grouped, and search views keep their intended rhythm.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/rows/WorkspaceBrowser.module.css', import.meta.url)), 'utf8')
const rowsCss = readFileSync(fileURLToPath(new URL('../src/client/rows/Rows.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one selector rule, keyed by property with whitespace collapsed.
 * Declaration order and trailing semicolons are normalized away.
 * @param selector - one exact selector, including a leading dot for local classes.
 * @returns the rule's declarations, or undefined when no such rule exists.
 */
function declarationsFrom(source: string, selector: string): Map<string, string> | undefined {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const found = new Map<string, string>()
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
  }
  return found.size === 0 ? undefined : found
}

const declarations = (selector: string): Map<string, string> | undefined => declarationsFrom(css, selector)
const rowDeclarations = (selector: string): Map<string, string> | undefined => declarationsFrom(rowsCss, selector)

describe('WorkspaceBrowser.module.css list', () => {
  const root = declarations('.root')
  const listArea = declarations('.listArea')
  const list = declarations('.list')

  it('is the scrolling region', () => {
    expect(list).toBeDefined()
    expect(list!.get('overflow-y')).toBe('auto')
  })

  it('counts the themed scrollbar inside the shell trailing inset', () => {
    expect(root?.get('--qilin-session-list-edge-inset')).toBe('var(--qilin-sidebar-inline-padding)')
    expect(root?.get('--qilin-session-list-scrollbar-width')).toBe('8px')
    expect(root?.get('--qilin-session-list-scrollbar-offset')).toBe('2px')
    expect(root?.get('padding-right')).toBe('var(--qilin-session-list-edge-inset)')
    expect(listArea?.get('margin-left')).toBe('-4px')
    expect(listArea?.get('padding-left')).toBe('4px')
    expect(listArea?.get('margin-right')).toBe('calc(-1 * var(--qilin-session-list-edge-inset))')
    expect(declarations('.fade')?.get('right')).toBe('var(--qilin-session-list-edge-inset)')
    expect(list?.get('margin-right')).toBe('var(--qilin-session-list-scrollbar-offset)')
    expect(list?.get('margin-left')).toBe('-4px')
    expect(list?.get('padding-left')).toBe('4px')
    expect(list?.get('padding-right')).toBe([
      'calc(',
      'var(--qilin-session-list-edge-inset)',
      '- var(--qilin-session-list-scrollbar-width)',
      '- var(--qilin-session-list-scrollbar-offset)',
      ')',
    ].join(' '))
    expect(declarations('.list::-webkit-scrollbar')).toBeUndefined()
  })

  it('reserves the scrollbar whether or not the list overflows', () => {
    expect(list!.get('scrollbar-gutter')).toBe('stable')
  })

  it('keeps 2px between rows and 4px between workspace groups', () => {
    expect(declarations('.flatList > * + *')?.get('margin-top')).toBe('2px')
    expect(declarations(".searchTree > [role='treeitem'] + [role='treeitem']")?.get('margin-top')).toBe('2px')
    expect(declarations('.groupSection > * + *')?.get('margin-top')).toBe('2px')
    expect(declarations('.groupSection + .groupSection')?.get('margin-top')).toBe('4px')
  })

  it('draws drag targets as a leading chevron joined to the insertion line', () => {
    const listTopMarker = declarations('.listTopDropIndicator')
    const workspaceMarker = declarations('.workspaceDropBefore::before')
    const sessionMarker = rowDeclarations('.sessionRow.dropBefore::before')
    expect(listTopMarker?.get('top')).toBe('-8px')
    expect(listTopMarker?.get('left')).toBe('0')
    expect(workspaceMarker?.get('left')).toBe('0')
    // The session marker spans the row's painted fill, which is inset by the
    // transparent border the row carries; the shell's inset cancels out again.
    expect(sessionMarker?.get('left')).toBe('calc(-1 * var(--qilin-sidebar-paint-inset))')
    expect(sessionMarker?.get('right')).toBe('calc(4px - var(--qilin-sidebar-paint-inset))')
    for (const marker of [listTopMarker, workspaceMarker, sessionMarker]) {
      expect(marker?.get('height')).toBe('12px')
      expect(marker?.get('background')).not.toContain('radial-gradient')
      expect(marker?.get('background')).toContain('55deg')
      expect(marker?.get('background')).toContain('125deg')
      expect(marker?.get('background')).toContain('calc(50% - 1px) calc(50% + 1px)')
      expect(marker?.get('background')).toContain('0 0 / 5px 7px')
      expect(marker?.get('background')).toContain('0 5px / 5px 7px')
      expect(marker?.get('background')).toContain('4px 5px / calc(100% - 4px) 2px')
    }
  })

  it('keeps the compact fade, overflow control, search field, and row heights', () => {
    expect(declarations('.fade')?.get('height')).toBe('24px')
    expect(declarations('.sessionOverflowButton')?.get('height')).toBe('28px')
    expect(declarations('.searchExpanded')?.get('height')).toBe('32px')
    expect(rowDeclarations('.projectRow')?.get('height')).toBe('34px')
    expect(rowDeclarations('.sessionRow')?.get('height')).toBe('32px')
    // One leading status cell for every session row, grouped or flat: the cell
    // hosts either the row's status dot or the leading seat, and it reserves its
    // own box, so the title's one shared margin below needs no per-view override.
    expect(rowDeclarations('.slot')?.get('width')).toBe('16px')
    expect(rowDeclarations('.slot')?.get('height')).toBe('20px')
    expect(rowDeclarations('.sessionRow .title')?.get('margin')).toBe('0 6px 0 var(--qilin-sidebar-label-gap)')
    expect(rowDeclarations('.searchResultRow')?.get('min-height')).toBe('48px')
    expect(rowDeclarations('.sessionRow.selected')?.get('background-color'))
      .toBe('var(--qilin-alias-interactive-bg-hover)')
  })

  it('marquees a clipped session title and fades both clipping edges', () => {
    // The frame walk and the reduced-motion jump belong to the browser lane in
    // apps/web/tests/sidebar-title-hover-scroll.e2e.ts: this helper merges
    // same-selector rules across media queries, so a reduce override would
    // mask the rules asserted here.
    expect(rowDeclarations('.sessionRow .title')?.get('flex')).toBe('1')
    expect(rowDeclarations('.sessionRow:hover .title')?.get('text-overflow')).toBe('clip')
    // An open menu pins the same hovered affordances as the pointer does.
    expect(rowDeclarations('.sessionRow.menuOpen .title')?.get('text-overflow')).toBe('clip')
    // The left fade follows any travel off the start, the right one marks the
    // text still beyond the cell, and both meet only while the crawl is under way.
    expect(rowDeclarations('.sessionRow .title[data-scrolled]')?.get('mask-image'))
      .toBe('linear-gradient(to right, transparent, #000 12px)')
    expect(rowDeclarations('.sessionRow .title[data-clipped]')?.get('mask-image'))
      .toBe('linear-gradient(to left, transparent, #000 12px)')
    expect(rowDeclarations('.sessionRow .title[data-scrolled][data-clipped]')?.get('mask-image'))
      .toBe('linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 12px), transparent)')
  })

  it('swaps the trailing time cell for the compact hover action strip', () => {
    expect(rowDeclarations('.rowActions')?.get('display')).toBe('none')
    expect(rowDeclarations('.rowActions')?.get('gap')).toBe('13px')
    for (const selector of ['.sessionRow:hover .rowActions', '.sessionRow.menuOpen .rowActions']) {
      expect(rowDeclarations(selector)?.get('display')).toBe('inline-flex')
    }
    expect(rowDeclarations('.sessionRow:hover .time')?.get('display')).toBe('none')
    // The static pin marker yields to the hover button that replaces it.
    expect(rowDeclarations('.sessionRow:hover .pinIndicator')?.get('display')).toBe('none')
    // The trailing strip keeps its 16px control cells; the buttons carry a 24px
    // click target centred on them through compensated margins.
    expect(rowDeclarations('.iconButton')?.get('width')).toBe('24px')
    expect(rowDeclarations('.iconButton')?.get('height')).toBe('24px')
    expect(rowDeclarations('.iconButton')?.get('margin')).toBe('-4px')
    expect(rowDeclarations('.iconButton:focus-visible')?.get('outline-offset')).toBe('-2px')
  })

  it('aligns rows on the sidebar metrics the shell supplies', () => {
    // The row fill is inset by a transparent border, so it never moves content.
    const sessionRow = rowDeclarations('.sessionRow')
    const paintInset = 'var(--qilin-sidebar-paint-inset)'
    // A Workspace row spaces its cells on the shell gap; a Session row zeroes it
    // and carries the same gap on the title margin instead.
    expect(rowDeclarations('.projectRow')?.get('gap')).toBe('var(--qilin-sidebar-label-gap)')
    expect(sessionRow?.get('gap')).toBe('0')
    expect(sessionRow?.get('border-inline')).toBe(`${paintInset} solid transparent`)
    expect(sessionRow?.get('background-clip')).toBe('padding-box')
    expect(sessionRow?.get('box-sizing')).toBe('border-box')
    expect(sessionRow?.get('padding-inline-start'))
      .toBe('calc(var(--qilin-sidebar-row-padding) - var(--qilin-sidebar-paint-inset) + var(--dsh-workspace-indent, 0px))')
    // A search row washes the same inset fill and keeps its title on the shared gap.
    const searchRow = rowDeclarations('.searchResultRow')
    expect(searchRow?.get('padding')).toBe('4px calc(var(--qilin-sidebar-row-padding) - var(--qilin-sidebar-paint-inset))')
    expect(searchRow?.get('border-inline')).toBe(`${paintInset} solid transparent`)
    expect(searchRow?.get('background-clip')).toBe('padding-box')
    expect(rowDeclarations('.searchResultTitle')?.get('margin')).toBe('0 var(--qilin-sidebar-label-gap)')
    expect(rowDeclarations('.searchResultMeta')?.get('margin-left')).toBe('calc(16px + var(--qilin-sidebar-label-gap))')
    // The time label pulls 1px so its optical edge matches the action strip's.
    expect(rowDeclarations('.time')?.get('margin-inline-end')).toBe('-1px')
  })

  it('aligns the section header on the shell padding and settles search expansion', () => {
    expect(declarations('.sectionHeader')?.get('padding-left')).toBe('var(--qilin-sidebar-row-padding)')
    // The label pulls 1px left so its glyph edge lines up with row titles.
    expect(declarations('.sectionLabel')?.get('position')).toBe('relative')
    expect(declarations('.sectionLabel')?.get('left')).toBe('-1px')
    // An expanded search drops the trailing inset, so the field fills the column.
    const expandedHeader = declarations('.root:not(.rail) .sectionHeader:has(.searchExpanded)')
    expect(expandedHeader?.get('margin-right')).toBe('0')
    expect(expandedHeader?.get('padding-inline')).toBe('calc(var(--qilin-sidebar-paint-inset) + 1px)')
    expect(expandedHeader?.get('gap')).toBe('0')
    // The header slides those three properties between states, and the reduce
    // block settles them: the declarations helper merges the later override, so
    // the pair is read from the stylesheet text.
    expect(css).toContain('margin-right 180ms var(--ds-ease-in-out)')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.root:not\(\.rail\) \.sectionHeader,/)
  })

  it('expands the search field into the header box and re-aligns its controls', () => {
    // The expanded field fills the header box instead of overhanging it, so its
    // edge stays on the shell padding the collapsed pill uses.
    const expanded = declarations('.searchExpanded')
    expect(expanded?.get('width')).toBe('100%')
    expect(expanded?.get('height')).toBe('32px')
    expect(expanded?.get('margin-inline')).toBe('0')
    expect(declarations('.searchExpanded .searchButton')?.get('height')).toBe('32px')
    // A hidden label drops its negative margin while search owns the header.
    expect(declarations('.sectionHeader:has(.searchExpanded) .sectionLabelHidden')?.get('margin-right')).toBe('0')
    // The Show-more control indents on the shell metrics instead of a literal,
    // and reads the same per-level indentation the group publishes.
    expect(declarations('.sessionOverflowButton')?.get('padding')).toBe(
      '0 var(--qilin-sidebar-row-padding) 0 calc(var(--qilin-sidebar-row-padding) + 16px + var(--qilin-sidebar-label-gap) + var(--dsh-workspace-indent, 0px))',
    )
  })

  it('keeps the collapsed column free of region controls', () => {
    // The rail keeps the header box as the list's top boundary; the add button
    // and the search pill are wide-only chrome, so no rail rule may size them.
    expect(declarations('.rail .sectionHeader')?.get('justify-content')).toBe('flex-start')
    expect(declarations('.rail .headerActions')).toBeUndefined()
    expect(declarations('.rail .iconButton')).toBeUndefined()
    expect(declarations('.rail .search')).toBeUndefined()
    expect(declarations('.rail .searchButton')).toBeUndefined()
  })
})
