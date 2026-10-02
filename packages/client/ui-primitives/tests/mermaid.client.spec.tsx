// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
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
  const LABELS = {
    code: { copyLabel: 'Copy', copiedLabel: 'Copied' },
    mermaid: { diagramLabel: 'Mermaid diagram', enlargedLabel: 'Mermaid diagram (enlarged)' },
    footnotes: undefined,
  } as never

  /** Render one mermaid fence against a fresh module registry carrying the given render mock. */
  async function renderDiagram(mockRender: ReturnType<typeof vi.fn>) {
    vi.resetModules()
    vi.doMock('mermaid', () => ({
      default: { initialize: vi.fn(), render: mockRender },
    }))
    const { MarkdownText } = await import('../src/markdown/MarkdownText.tsx')
    return render(<MarkdownText
      text={'```mermaid\ngraph TD\n  a --> b\n```'}
      labels={LABELS}
    />)
  }

  it('renders the sanitized diagram and opens the zoom modal from pointer and keyboard', async () => {
    const svg = '<svg viewBox="0 0 10 10"><rect width="4" height="4"/></svg>'
    const view = await renderDiagram(vi.fn().mockResolvedValue({ svg }))
    const stage = await view.findByRole('button', { name: 'Mermaid diagram' })
    expect(stage.querySelector('rect')).toBeTruthy()
    fireEvent.click(stage)
    expect(view.getByRole('img', { name: 'Mermaid diagram (enlarged)' }).querySelector('rect')).toBeTruthy()
    fireEvent.click(view.getByRole('img', { name: 'Mermaid diagram (enlarged)' }))
    expect(view.getByRole('img', { name: 'Mermaid diagram (enlarged)' })).toBeTruthy()
    fireEvent.click(view.getByRole('presentation'))
    expect(view.queryByRole('img', { name: 'Mermaid diagram (enlarged)' })).toBeNull()
    fireEvent.keyDown(view.getByRole('button', { name: 'Mermaid diagram' }), { key: 'Enter' })
    expect(view.getByRole('img', { name: 'Mermaid diagram (enlarged)' })).toBeTruthy()
  })

  it('renders the fenced source through the markdown pipeline when the library rejects it', async () => {
    const view = await renderDiagram(vi.fn().mockRejectedValue(new Error('diagram syntax error')))
    expect(await view.findByRole('alert')).toBeTruthy()
    expect(view.container.textContent).toContain('diagram syntax error')
  })
})
