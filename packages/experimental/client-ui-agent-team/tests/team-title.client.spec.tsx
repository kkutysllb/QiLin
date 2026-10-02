// @vitest-environment jsdom
/** The chip title: the person glyph, then the type's label. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { PropsRuntime } from '@qilin/client-ui-slots'
import { TeamTitle } from '../src/client/TeamBody.tsx'

afterEach(cleanup)

function props(title: string): PropsRuntime<'sidebar.right.pane.tab.title'> {
  return { useTabInfo: () => ({ tab: { title } }) } as PropsRuntime<'sidebar.right.pane.tab.title'>
}

describe('TeamTitle', () => {
  it('draws the person glyph before the title text, sized to the chip line', () => {
    const { container } = render(<TeamTitle {...props('智能体团队')} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('智能体团队')
  })
})
