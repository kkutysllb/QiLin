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
describe('MermaidDiagram module caching, scheme, and cancellation', () => {
  const LABELS = {
    code: { copyLabel: 'Copy', copiedLabel: 'Copied' },
    mermaid: { diagramLabel: 'Mermaid diagram', enlargedLabel: 'Mermaid diagram (enlarged)' },
    footnotes: undefined,
  } as never
  const TEXT = '```mermaid\ngraph TD\n  a --> b\n```'
  const OTHER = '```mermaid\ngraph TD\n  c --> d\n```'
  const SVG = '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'

  afterEach(() => { vi.unstubAllGlobals() })

  /** Render markdown against a fresh registry whose mermaid double records its configuration. */
  async function renderWith(text: string, options: { dark?: boolean; render?: ReturnType<typeof vi.fn> } = {}) {
    vi.resetModules()
    const initialize = vi.fn()
    const renderMock = options.render ?? vi.fn().mockResolvedValue({ svg: SVG })
    vi.doMock('mermaid', () => ({ default: { initialize, render: renderMock } }))
    if (options.dark !== undefined) {
      vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: options.dark })))
    }
    const { MarkdownText } = await import('../src/markdown/MarkdownText.tsx')
    return { view: render(<MarkdownText text={text} labels={LABELS} />), initialize, renderMock, MarkdownText }
  }

  it('configures the library once for the page and reuses it for a later diagram', async () => {
    const { view, initialize, renderMock, MarkdownText } = await renderWith(TEXT)
    await view.findByRole('button', { name: 'Mermaid diagram' })

    // A later diagram on the same page keeps the configured library.
    const later = render(<MarkdownText text={OTHER} labels={LABELS} />)
    await vi.waitFor(() => {
      expect(later.container.querySelector('[data-mermaid-diagram]')).not.toBeNull()
    })
    expect(later.container.querySelectorAll('[role="alert"]')).toHaveLength(0)
    expect(renderMock).toHaveBeenCalledTimes(2)
    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it('configures the dark diagram theme under a dark color scheme', async () => {
    const { view, initialize } = await renderWith(TEXT, { dark: true })
    expect(await view.findByRole('button', { name: 'Mermaid diagram' })).toBeTruthy()
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark', securityLevel: 'strict', htmlLabels: false }))
  })

  it('opens the enlarged copy from Space and ignores other keys', async () => {
    const { view } = await renderWith(TEXT)
    const stage = await view.findByRole('button', { name: 'Mermaid diagram' })
    fireEvent.keyDown(stage, { key: 'a' })
    expect(view.queryByRole('img', { name: 'Mermaid diagram (enlarged)' })).toBeNull()
    fireEvent.keyDown(stage, { key: ' ' })
    expect(view.getByRole('img', { name: 'Mermaid diagram (enlarged)' })).toBeTruthy()
  })

  it('shows a rejection that is not an Error by its string form', async () => {
    const { view } = await renderWith(TEXT, { render: vi.fn().mockRejectedValue('plain failure') })
    expect((await view.findByRole('alert')).textContent).toContain('plain failure')
  })

  it('drops a render that settles after the diagram unmounts', async () => {
    let settle!: (value: { svg: string }) => void
    const pending = new Promise<{ svg: string }>((resolve) => { settle = resolve })
    const renderMock = vi.fn(() => pending)
    const { view, renderMock: renderer } = await renderWith(TEXT, { render: renderMock })
    view.unmount()
    settle({ svg: SVG })
    await vi.waitFor(() => { expect(renderer).toHaveBeenCalledTimes(1) })
    expect(view.container.firstChild).toBeNull()
  })

  it('keeps a streaming mermaid fence as source until it settles', async () => {
    vi.resetModules()
    const renderMock = vi.fn().mockResolvedValue({ svg: SVG })
    vi.doMock('mermaid', () => ({ default: { initialize: vi.fn(), render: renderMock } }))
    const { MarkdownText } = await import('../src/markdown/MarkdownText.tsx')
    const view = render(<MarkdownText text={TEXT} labels={LABELS} streaming />)
    // While the answer streams, the fence stays visible source.
    expect(view.container.querySelector('pre')).toBeTruthy()
    expect(view.container.querySelector('[data-mermaid-diagram]')).toBeNull()
    expect(renderMock).not.toHaveBeenCalled()

    view.rerender(<MarkdownText text={TEXT} labels={LABELS} />)
    expect(await view.findByRole('button', { name: 'Mermaid diagram' })).toBeTruthy()
    expect(renderMock).toHaveBeenCalledTimes(1)
  })

  it('drops a rejection that lands after the diagram unmounts', async () => {
    let fail!: (reason: unknown) => void
    const pending = new Promise<{ svg: string }>((_resolve, reject) => { fail = reject })
    const renderMock = vi.fn(() => pending)
    const { view, renderMock: renderer } = await renderWith(TEXT, { render: renderMock })
    view.unmount()
    fail(new Error('too late'))
    await vi.waitFor(() => { expect(renderer).toHaveBeenCalledTimes(1) })
    expect(view.container.firstChild).toBeNull()
  })
})
