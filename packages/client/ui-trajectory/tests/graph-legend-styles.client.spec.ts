/**
 * The trajectory graph legend as CSS text. jsdom has no layout, so the
 * rendering specs pin which anchors the legend renders but cannot show what
 * happens when the pane narrows: a shrinkable chip breaks its label across
 * lines one character at a time. These read the declarations that keep every
 * chip at its intrinsic width and wrap whole chips instead.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  fileURLToPath(new URL('../src/client/TrajectoryGraphView.module.css', import.meta.url)),
  'utf8',
)

/** Declarations of one flat selector rule, comments stripped. */
function declarationsFrom(css: string, selector: string): string[] {
  const declarationText = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const rule = new RegExp(`(?:^|[{}])\\s*${selector.replace(/[.[\]():*+^$\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`).exec(declarationText)
  if (rule === null) throw new Error(`no \`${selector}\` rule`)
  return (rule[1] ?? '').split(';').map(part => part.trim()).filter(Boolean)
}

describe('trajectory graph legend', () => {
  it('keeps a lane or edge chip on one line at its intrinsic width', () => {
    for (const selector of ['.legendItem', '.legendEdge']) {
      expect(declarationsFrom(source, selector), selector).toEqual(
        expect.arrayContaining(['flex: none', 'white-space: nowrap']),
      )
    }
  })

  it('wraps whole chips in the space the search field leaves', () => {
    expect(declarationsFrom(source, '.legendChips')).toEqual(expect.arrayContaining([
      'display: flex',
      'flex: 1 1 auto',
      'flex-wrap: wrap',
      'min-width: 0',
    ]))
  })
})
