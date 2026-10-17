// @vitest-environment jsdom
/** ShortcutKeys: keycaps by presentation variant, with combinations grouped. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ShortcutKeys } from '../src/ShortcutKeys.tsx'

afterEach(cleanup)

describe('ShortcutKeys', () => {
  it('renders one keycap per key without the tooltip treatment', () => {
    const view = render(<ShortcutKeys keys={['⌘', 'K']} />)
    const keys = view.container.querySelectorAll('kbd')
    expect([...keys].map(key => key.textContent)).toEqual(['⌘', 'K'])
    const wrapper = view.container.firstElementChild!
    expect(wrapper.className).not.toContain('tooltip')
    expect(wrapper.className).not.toContain('joined')
  })

  it('groups a tooltip combination and marks its plus separator', () => {
    const view = render(<ShortcutKeys keys={['⌘', '+', 'K']} variant="tooltip" />)
    const wrapper = view.container.firstElementChild!
    expect(wrapper.className).toContain('tooltip')
    expect(wrapper.className).toContain('joined')
    const keys = [...view.container.querySelectorAll('kbd')]
    expect(keys.map(key => key.textContent)).toEqual(['⌘', '+', 'K'])
    expect(keys[1]!.className).toContain('separator')
    expect(keys[0]!.className).not.toContain('separator')
  })

  it('leaves a tooltip sequence without a plus unjoined and keeps caller classes', () => {
    const view = render(<ShortcutKeys keys={['⌘', 'K']} variant="tooltip" className="extra" />)
    const wrapper = view.container.firstElementChild!
    expect(wrapper.className).toContain('tooltip')
    expect(wrapper.className).not.toContain('joined')
    expect(wrapper.className).toContain('extra')
  })
})
