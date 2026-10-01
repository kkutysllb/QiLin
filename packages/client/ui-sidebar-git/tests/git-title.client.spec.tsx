// @vitest-environment jsdom
/** The chip title: the branch glyph, then the type's label. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { PropsRuntime } from '@qilin/client-ui-slots'
import { GitTitle } from '../src/client/GitTitle.tsx'

afterEach(cleanup)

function props(title: string): PropsRuntime<'sidebar.right.pane.tab.title'> {
  return { useTabInfo: () => ({ tab: { title } }) } as unknown as PropsRuntime<'sidebar.right.pane.tab.title'>
}

describe('GitTitle', () => {
  it('draws the branch glyph before the title text, sized to the chip line', () => {
    const { container } = render(<GitTitle {...props('源代码管理')} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('源代码管理')
  })
})
