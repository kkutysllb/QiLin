// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as primitives from '@qilin-agent/client-ui-primitives'

afterEach(cleanup)

const V2_EXPORTS = [
  'IconChevronDown', 'IconChevronUp', 'IconChevronRight', 'IconClose', 'IconCheck', 'IconPlus',
  'IconSearch', 'IconSettings', 'IconSend', 'IconTrash', 'IconEdit', 'IconBranch', 'IconGlobe',
  'IconDatabase', 'IconApi', 'IconThink', 'IconPlan', 'IconQueue', 'IconBrowse',
  'IconContextInjection', 'IconWarning', 'IconSparkle', 'IconQuestion', 'IconAgentPreset',
  'IconPersonalization',
] as const

const icons = primitives as unknown as Record<string, (props: primitives.IconProps) => React.JSX.Element>

describe('24-grid icon set', () => {
  it('exports every glyph with the shared 24 grid and stroke treatment', () => {
    expect(primitives.ICON_V2_GRID).toBe(24)
    expect(primitives.ICON_V2_STROKE).toBe(1.5)
    for (const name of V2_EXPORTS) {
      const Icon = icons[name]!
      expect(Icon, name).toBeTypeOf('function')
      const { container, unmount } = render(<Icon />)
      const svg = container.querySelector('svg')!
      expect(svg.getAttribute('viewBox'), name).toBe('0 0 24 24')
      expect(svg.getAttribute('width'), name).toBe('24')
      expect(svg.getAttribute('height'), name).toBe('24')
      expect(svg.getAttribute('stroke'), name).toBe('currentColor')
      expect(svg.getAttribute('stroke-width'), name).toBe('1.5')
      expect(svg.getAttribute('stroke-linecap'), name).toBe('round')
      expect(svg.getAttribute('stroke-linejoin'), name).toBe('round')
      expect(svg.getAttribute('fill'), name).toBe('none')
      expect(svg.getAttribute('aria-hidden'), name).toBe('true')
      expect(svg.children.length, name).toBeGreaterThan(0)
      unmount()
    }
  })

  it('scales through the size prop without changing the grid', () => {
    const { container, unmount } = render(<primitives.IconChevronDown size={16} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('height')).toBe('16')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    unmount()
  })
})
