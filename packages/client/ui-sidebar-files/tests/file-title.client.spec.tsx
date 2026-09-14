// @vitest-environment jsdom
/** The chip title: the open file's type sheet before its basename. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { PropsRuntime } from '@qilin/client-ui-slots'
import { FileTitle } from '../src/client/FileTitle.tsx'

afterEach(cleanup)

function props(title: string): PropsRuntime<'sidebar.right.pane.tab.title'> {
  return { useTabInfo: () => ({ tab: { title } }) } as unknown as PropsRuntime<'sidebar.right.pane.tab.title'>
}

describe('FileTitle', () => {
  it('draws the file\'s own type sheet before the title text, sized to the chip line', () => {
    const ts = render(<FileTitle {...props('a.ts')} />)
    const svg = ts.container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(ts.container.textContent).toBe('a.ts')
    const md = render(<FileTitle {...props('b.md')} />)
    // The sheet classifies the name: markdown draws a different glyph than code.
    expect(md.container.querySelector('svg')?.innerHTML).not.toBe(svg?.innerHTML)
  })
})
