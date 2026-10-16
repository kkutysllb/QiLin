// @vitest-environment jsdom
/**
 * Fixed-palette plugin artwork. Unlike the icon set these glyphs carry their
 * own brand colors and gradients, so what is pinned here is the shared 36px
 * grid, the size/className contract, and the per-instance def ids that keep
 * repeated artwork referencing its own gradients.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PluginArtworkDefault, PluginArtworkLoop, PluginArtworkSearch, PluginArtworkSubagent, PluginArtworkTerminal,
} from '@qilin-agent/client-ui-primitives'

afterEach(cleanup)

describe('plugin artwork', () => {
  it.each([
    ['terminal', PluginArtworkTerminal],
    ['agent loop', PluginArtworkLoop],
    ['web search', PluginArtworkSearch],
    ['subagent', PluginArtworkSubagent],
    ['default', PluginArtworkDefault],
  ] as const)('draws the %s artwork on the shared 36px grid', (_name, Artwork) => {
    const { container } = render(<Artwork size={24} className="mark" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 36 36')
    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('height')).toBe('24')
    expect(svg?.getAttribute('class')).toBe('mark')
    expect(container.querySelectorAll('path, rect')).not.toHaveLength(0)
  })

  it('defaults to 36px and gives each rendered instance its own def ids', () => {
    const { container } = render(
      <>
        <PluginArtworkLoop />
        <PluginArtworkLoop />
        <PluginArtworkSearch />
        <PluginArtworkSubagent />
        <PluginArtworkDefault />
      </>,
    )
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('36')

    // Two cards of the same artwork would otherwise share one gradient id and
    // paint every url(#) reference from the first instance.
    const ids = Array.from(container.querySelectorAll('[id]'), node => node.id)
    expect(ids.length).toBeGreaterThan(1)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
