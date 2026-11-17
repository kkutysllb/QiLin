/** The fish mark keeps its native geometry and scales by width. */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FishLogo, FISH_LOGO_PATH, FISH_LOGO_VIEWBOX } from '../src/FishLogo.tsx'

describe('FishLogo', () => {
  it('draws the exported silhouette at the requested width with the native ratio', () => {
    const markup = renderToStaticMarkup(<FishLogo size={48} className="mark" />)
    expect(markup).toContain('viewBox="0 0 23.16 17.04"')
    expect(markup).toContain(`d="${FISH_LOGO_PATH}"`)
    expect(markup).toContain('width="48"')
    expect(markup).toContain('class="mark"')
    expect(markup).toContain('aria-hidden="true"')
  })

  it('defaults to 24px wide', () => {
    expect(renderToStaticMarkup(<FishLogo />)).toContain('width="24"')
    expect(FISH_LOGO_VIEWBOX).toEqual({ width: 23.16, height: 17.04 })
  })
})
