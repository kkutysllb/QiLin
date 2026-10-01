// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sanitizeMermaidSvg } from '../src/markdown/mermaid.tsx'

afterEach(cleanup)

describe('sanitizeMermaidSvg', () => {
  it('keeps diagram geometry, text, gradients, and classes', () => {
    const svg = '<svg viewBox="0 0 10 10"><g class="cluster"><rect width="4" height="4" fill="#abc"/><text font-size="12">hi</text></g><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></svg>'
    const out = sanitizeMermaidSvg(svg)
    expect(out).toContain('<rect')
    expect(out).toContain('<text')
    expect(out).toContain('linearGradient')
    expect(out).toContain('class="cluster"')
  })

  it('strips scripts, event handlers, foreignObject, and javascript: URLs', () => {
    const svg = '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect onclick="alert(2)" width="1" height="1"/><foreignObject><body>x</body></foreignObject><a href="javascript:alert(3)">l</a><path d="M0 0"/></svg>'
    const out = sanitizeMermaidSvg(svg)
    expect(out).not.toContain('script')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('foreignObject')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('<path')
  })
})

describe('MermaidDiagram render integration', () => {
  it('renders the fenced source through the markdown pipeline when the library rejects it', async () => {
    const { MarkdownText } = await import('../src/markdown/MarkdownText.tsx')
    vi.doMock('mermaid', () => ({
      default: {
        initialize: vi.fn(),
        render: vi.fn().mockRejectedValue(new Error('diagram syntax error')),
      },
    }))
    const view = render(<MarkdownText
      text={'```mermaid\ngraph TD\n  broken[\n```'}
      labels={{ code: { copyLabel: 'Copy', copiedLabel: 'Copied' }, footnotes: undefined } as never}
    />)
    expect(await view.findByRole('alert')).toBeTruthy()
    expect(view.container.textContent).toContain('diagram syntax error')
  })
})
