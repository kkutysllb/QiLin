// @vitest-environment jsdom
/**
 * What the viewer does with a selection: the button it anchors, the payload it
 * would commit, and every selection it refuses to act on.
 *
 * jsdom's Selection cannot measure a range, so the document's own selection is
 * shadowed on the members the gesture reads; `linesOfSelection` and the fence
 * are covered by their own unit spec, and this one asserts the gesture and the
 * payload it produces.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { TextPreview } from '../src/client/TextPreview.tsx'
import { page, harness, settle } from './fixtures.client.ts'

/**
 * The document's real selection probe, captured before any spec replaces it:
 * the specs drive the gesture through a spy on `window.getSelection`, so the
 * stood-in value must not come from that spy.
 */
const liveSelection = window.getSelection.bind(window)

/**
 * The document's selection with the members the mouse-up gesture reads
 * shadowed on the instance, so the value stays a real `Selection`.
 * @param options - the anchor, focus, text, collapse state, and range box the spec states.
 * @returns the selection `window.getSelection` will answer with.
 */
function selection(options: {
  anchor: Node | null
  focus?: Node | null
  text?: string
  collapsed?: boolean
  rect?: { left: number; top: number; width: number }
}): Selection {
  const { anchor, focus = anchor, text = '', collapsed = false, rect } = options
  const live = liveSelection()
  if (live === null) throw new Error('expected the document to carry a Selection')
  const shadow = (name: string, value: unknown): void => {
    Object.defineProperty(live, name, { value, configurable: true })
  }
  shadow('isCollapsed', collapsed)
  shadow('anchorNode', anchor)
  shadow('focusNode', focus)
  shadow('toString', () => text)
  shadow('getRangeAt', () => ({
    getBoundingClientRect: () => ({ left: rect?.left ?? 0, top: rect?.top ?? 0, width: rect?.width ?? 0 }),
  }))
  return live
}

function body(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>('[data-textpreview-body]')
  if (element === null) throw new Error('expected the file body')
  return element
}

function popup(view: { container: HTMLElement; baseElement: HTMLElement }): HTMLButtonElement | null {
  return view.baseElement.querySelector('[data-textpreview-selection-popup]')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TextPreview — selection to conversation', () => {
  it('anchors the button and commits the fenced selection', async () => {
    const h = harness({ 1: page(1, ['alpha', 'beta', 'gamma'], true) })
    let anchor: Node | null = null
    const getSelection = vi.spyOn(window, 'getSelection').mockImplementation(() => selection({
      anchor, text: 'beta', rect: { left: 100, top: 60, width: 40 },
    }))
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    anchor = body(view.container).firstElementChild ?? body(view.container)
    fireEvent.mouseUp(body(view.container))
    const button = popup(view)
    expect(button?.textContent).toBe('addToConversation')
    expect(button?.style.top).toBe('60px')
    expect(button?.style.left).toBe(`${Math.min(Math.max(120, 80), window.innerWidth - 80)}px`)
    expect(getSelection).toHaveBeenCalled()

    fireEvent.mouseDown(button as HTMLButtonElement)
    expect(h.insertSelection).not.toHaveBeenCalled()
    fireEvent.click(button as HTMLButtonElement)
    expect(h.insertSelection).toHaveBeenCalledWith('```work/notes.md:2\nbeta\n```')
    expect(popup(view)).toBeNull()
  })

  it('keeps the selection alive through the button press', async () => {
    const h = harness({ 1: page(1, ['alpha', 'beta'], true) })
    let anchor: Node | null = null
    vi.spyOn(window, 'getSelection').mockImplementation(() => selection({ anchor, text: 'beta' }))
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    anchor = body(view.container).firstElementChild ?? body(view.container)
    fireEvent.mouseUp(body(view.container))
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    popup(view)?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(popup(view)).not.toBeNull()
  })

  it('applies no button when the host reports no selection at all', async () => {
    const h = harness({ 1: page(1, ['alpha'], true) })
    vi.spyOn(window, 'getSelection').mockReturnValue(null)
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.mouseUp(body(view.container))
    expect(popup(view)).toBeNull()
  })

  it('applies no button to a collapsed caret', async () => {
    const h = harness({ 1: page(1, ['alpha'], true) })
    vi.spyOn(window, 'getSelection').mockReturnValue(selection({ anchor: null, collapsed: true }))
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.mouseUp(body(view.container))
    expect(popup(view)).toBeNull()
  })

  it('applies no button to a selection outside the body', async () => {
    const h = harness({ 1: page(1, ['alpha'], true) })
    const outside = document.createElement('p')
    document.body.append(outside)
    try {
      vi.spyOn(window, 'getSelection').mockReturnValue(selection({ anchor: outside, focus: null, text: 'alpha' }))
      const view = render(<TextPreview {...h.props()} />)
      await settle()
      fireEvent.mouseUp(body(view.container))
      expect(popup(view)).toBeNull()
    } finally {
      outside.remove()
    }
  })

  it('applies no button to a selection anchored in the body but ending outside it', async () => {
    const h = harness({ 1: page(1, ['alpha'], true) })
    const outside = document.createElement('p')
    document.body.append(outside)
    try {
      const view = render(<TextPreview {...h.props()} />)
      await settle()
      vi.spyOn(window, 'getSelection').mockReturnValue(selection({
        anchor: body(view.container), focus: outside, text: 'alpha',
      }))
      fireEvent.mouseUp(body(view.container))
      expect(popup(view)).toBeNull()
    } finally {
      outside.remove()
    }
  })

  it('applies no button to a whitespace-only selection', async () => {
    const h = harness({ 1: page(1, ['alpha'], true) })
    let anchor: Node | null = null
    vi.spyOn(window, 'getSelection').mockImplementation(() => selection({ anchor, text: '   ' }))
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    anchor = body(view.container)
    fireEvent.mouseUp(body(view.container))
    expect(popup(view)).toBeNull()
  })

  it('applies no button where the viewer holds no text of its own', async () => {
    // Nothing read yet: the body is up with no content, so there is no source
    // for the line lookup and the gesture stays inert.
    const h = harness()
    const anchor = document.createElement('p')
    document.body.append(anchor)
    try {
      const view = render(<TextPreview {...h.props()} />)
      await settle()
      vi.spyOn(window, 'getSelection').mockReturnValue(selection({
        anchor, text: 'alpha', rect: { left: 10, top: 10, width: 10 },
      }))
      fireEvent.mouseUp(body(view.container))
      expect(popup(view)).toBeNull()
    } finally {
      anchor.remove()
    }
  })

  it('hides the button when a later selection covers nothing', async () => {
    const h = harness({ 1: page(1, ['alpha', 'beta'], true) })
    let anchor: Node | null = null
    let text = 'beta'
    vi.spyOn(window, 'getSelection').mockImplementation(() => selection({ anchor, text }))
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    anchor = body(view.container).firstElementChild ?? body(view.container)
    fireEvent.mouseUp(body(view.container))
    expect(popup(view)).not.toBeNull()
    text = '  '
    fireEvent.mouseUp(body(view.container))
    expect(popup(view)).toBeNull()
  })

  it('names the path without lines when the rendered text is not in the source', async () => {
    // The reverse lookup is best-effort: a rendered selection the source does
    // not contain still commits, under the bare path.
    const h = harness({ 1: page(1, ['alpha', 'beta'], true) })
    let anchor: Node | null = null
    vi.spyOn(window, 'getSelection').mockImplementation(() => selection({ anchor, text: 'absent' }))
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    anchor = body(view.container).firstElementChild ?? body(view.container)
    fireEvent.mouseUp(body(view.container))
    fireEvent.click(popup(view) as HTMLButtonElement)
    expect(h.insertSelection).toHaveBeenCalledWith('```work/notes.md\nabsent\n```')
  })

  it('drops the button when the body leaves the viewport', async () => {
    class FakeIntersectionObserver implements IntersectionObserver {
      static latest: FakeIntersectionObserver | undefined
      readonly root: Element | Document | null = null
      readonly rootMargin: string = ''
      readonly scrollMargin: string = ''
      readonly thresholds: readonly number[] = []
      readonly disconnect = vi.fn<() => void>()

      constructor(private readonly callback: IntersectionObserverCallback) {
        FakeIntersectionObserver.latest = this
      }

      observe(): void {}
      unobserve(): void {}
      takeRecords(): IntersectionObserverEntry[] { return [] }

      leave(target: Element): void {
        this.callback([{ target, isIntersecting: false } as IntersectionObserverEntry], this)
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    const h = harness({ 1: page(1, ['alpha', 'beta'], true) })
    let anchor: Node | null = null
    vi.spyOn(window, 'getSelection').mockImplementation(() => selection({ anchor, text: 'beta' }))
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    const surface = body(view.container)
    anchor = surface.firstElementChild ?? surface
    fireEvent.mouseUp(surface)
    expect(popup(view)).not.toBeNull()
    const observer = FakeIntersectionObserver.latest
    if (observer === undefined) throw new Error('expected the body to be observed')
    act(() => { observer.leave(surface) })
    expect(popup(view)).toBeNull()
  })
})
