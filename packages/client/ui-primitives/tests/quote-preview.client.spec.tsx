// @vitest-environment jsdom
/**
 * Quote surfaces in sent user text: a blockquote excerpt renders as one quote
 * with its own copy and jump controls, the enabled surface never re-interprets
 * excerpt text, and a caller that offers no quotes keeps the literal characters.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { QuotePreview } from '../src/QuotePreview.tsx'
import { projectUserText } from '../src/user-text.tsx'
import type { UserTextQuotes } from '../src/user-text.tsx'

const labels = { copy: '复制引用', copied: '已复制', jump: '跳转到原文' }

/** Install an async clipboard for one case and restore the prior host shape. */
function stubClipboard(): ReturnType<typeof vi.fn> {
  const prior = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  afterEach(() => {
    if (prior === undefined) Reflect.deleteProperty(navigator, 'clipboard')
    else Object.defineProperty(navigator, 'clipboard', prior)
  })
  return writeText
}

const project = (text: string, quotes?: UserTextQuotes) =>
  render(<div data-host>{projectUserText(text, [], [], 'skill', undefined, undefined, quotes)}</div>)
    .container.querySelector('[data-host]')!

describe('QuotePreview', () => {
  it('renders the excerpt and copies exactly its text', async () => {
    const writeText = stubClipboard()
    const host = render(<QuotePreview text={'被引用的字'} labels={labels} />).container
    expect(host.querySelector('[data-quote-preview-text]')!.textContent).toBe('被引用的字')
    // A press on the control keeps the surrounding text selection intact.
    expect(fireEvent.pointerDown(host.querySelector('[data-quote-copy]')!)).toBe(false)
    await act(async () => {
      fireEvent.click(host.querySelector('[data-quote-copy]')!)
    })
    expect(writeText).toHaveBeenCalledWith('被引用的字')
    expect(host.querySelector('[data-quote-copy]')!.getAttribute('aria-label')).toBe('已复制')
  })

  it('stays on the copy label when the clipboard refuses the write', async () => {
    const prior = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => { throw new Error('denied') }) },
    })
    try {
      const host = render(<QuotePreview text="x" labels={labels} />).container
      await act(async () => {
        fireEvent.click(host.querySelector('[data-quote-copy]')!)
      })
      expect(host.querySelector('[data-quote-copy]')!.getAttribute('aria-label')).toBe('复制引用')
    } finally {
      if (prior === undefined) Reflect.deleteProperty(navigator, 'clipboard')
      else Object.defineProperty(navigator, 'clipboard', prior)
    }
  })

  it('re-measures clipping through the observer and releases it on unmount', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    let fire: (() => void) | undefined
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { fire = callback }
      observe = observe
      disconnect = disconnect
    })
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 100 })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 10 })
    try {
      const view = render(<QuotePreview text="一段很长的引用" labels={labels} />)
      expect(observe).toHaveBeenCalledTimes(1)
      act(() => { fire?.() })
      view.unmount()
      expect(disconnect).toHaveBeenCalledTimes(1)
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth')
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
      vi.unstubAllGlobals()
    }
  })

  it('measures once on a host that has no size observer', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    try {
      const host = render(<QuotePreview text="x" labels={labels} />).container
      expect(host.querySelector('[data-quote-preview-text]')!.textContent).toBe('x')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reveals the quoted source only when the owner supplies the action', () => {
    const onJump = vi.fn()
    const withJump = render(<QuotePreview text="x" labels={labels} onJump={onJump} />).container
    fireEvent.click(withJump.querySelector('[data-quote-jump]')!)
    expect(onJump).toHaveBeenCalledTimes(1)
    const inert = render(<QuotePreview text="x" labels={labels} />).container
    expect(inert.querySelector('[data-quote-jump]')).toBeNull()
  })
})

describe('projectUserText quotes', () => {
  it('renders a blockquote span as one quote and keeps the surrounding prose', () => {
    const host = project('先说\n> 引用的一句话\n再说', { labels, onJump: () => {} })
    const quotes = host.querySelectorAll('[data-quote-preview]')
    expect(quotes.length).toBe(1)
    expect(host.querySelector('[data-quote-preview-text]')!.textContent).toBe('引用的一句话')
    expect(host.textContent).toBe('先说\n引用的一句话\n再说')
  })

  it('keeps excerpt text literal: no reference chip or slash chip inside a quote', () => {
    const host = project('> @文件名.txt /plan.md 都在引用里', { labels })
    expect(host.querySelectorAll('[data-ref-chip]').length).toBe(0)
    expect(host.querySelector('[data-quote-preview-text]')!.textContent).toBe('@文件名.txt /plan.md 都在引用里')
  })

  it('jumps to the source the quote names', () => {
    const onJump = vi.fn()
    const host = project('> [quoted](qilin-quote:seq-7)\n> 引用内容', { labels, onJump })
    expect(host.querySelector('[data-quote-preview-text]')!.textContent).toBe('引用内容')
    fireEvent.click(host.querySelector('[data-quote-jump]')!)
    expect(onJump).toHaveBeenCalledWith('seq-7')
  })

  it('hides the jump control for a quote that names no source', () => {
    const host = project('> 没有来源', { labels, onJump: () => {} })
    expect(host.querySelector('[data-quote-jump]')).toBeNull()
  })

  it('leaves blockquote characters literal when the caller offers no quotes', () => {
    const host = project('先说\n> 引用的一句话\n再说')
    expect(host.querySelector('[data-quote-preview]')).toBeNull()
    expect(host.textContent).toBe('先说\n> 引用的一句话\n再说')
  })

  it('keeps a four-space-indented line and a bare greater-than sign plain', () => {
    const host = project('    > 不是引用\na > b', { labels })
    expect(host.querySelector('[data-quote-preview]')).toBeNull()
  })

  it('keeps a credential inside a quote masked instead of quoting it', () => {
    const host = project('> key sk-abcdef0123456789abcdef0123456789', { labels })
    expect(host.querySelector('[data-quote-preview]')).toBeNull()
    expect(host.textContent).not.toContain('sk-abcdef0123456789abcdef0123456789')
  })

  it('renders every separated quote run as its own surface', () => {
    const host = project('> 一\n\n> 二', { labels })
    expect([...host.querySelectorAll('[data-quote-preview-text]')].map(n => n.textContent)).toEqual(['一', '二'])
  })
})
