// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RunningSeal } from '../src/client/chat/RunningSeal.tsx'

afterEach(cleanup)

describe('RunningSeal', () => {
  it('renders a decorative seal seat without inline styles or animation elements', () => {
    const view = render(<RunningSeal />)
    const icon = view.container.firstElementChild!
    expect(icon.tagName).toBe('SPAN')
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    const svg = icon.querySelector('svg')!
    expect(icon.children).toHaveLength(1)
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('width')).toBe('14')
    // The breathing animation lives in the class, never inline or SMIL.
    expect(svg.getAttribute('class')).toMatch(/runningSeal/)
    expect(view.container.querySelector('animate')).toBeNull()
    expect(view.container.querySelector('[style]')).toBeNull()
    // The seal carries its own cinnabar body gradient.
    expect(svg.querySelector('linearGradient')).not.toBeNull()
  })
})
