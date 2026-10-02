// @vitest-environment jsdom
/**
 * The floating selection button: what anchors it, and every way it is
 * dismissed — an outside press, Escape, the document going hidden, the window
 * losing focus, and the viewer surface leaving the viewport.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { useSelectionPopup } from '../src/client/selection-popup.ts'
import type { SelectionPopupControls } from '../src/client/selection-popup.ts'

/** The observer the specs drive by hand; jsdom ships none. */
class FakeIntersectionObserver implements IntersectionObserver {
  static latest: FakeIntersectionObserver | undefined
  readonly root: Element | Document | null = null
  readonly rootMargin: string = ''
  readonly thresholds: readonly number[] = []
  readonly observed: Element[] = []
  readonly disconnect = vi.fn<() => void>()

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.latest = this
  }

  observe(element: Element): void { this.observed.push(element) }
  unobserve(): void {}
  takeRecords(): IntersectionObserverEntry[] { return [] }

  leave(element: Element): void {
    this.callback([{ target: element, isIntersecting: false } as IntersectionObserverEntry], this)
  }

  enter(element: Element): void {
    this.callback([{ target: element, isIntersecting: true } as IntersectionObserverEntry], this)
  }
}

/** One host: a surface, a control per gesture, and the button the hook anchors. */
function Host({ onCommit, surface, onReady }: {
  onCommit: (insert: string) => void
  surface: HTMLElement | null
  onReady: (controls: SelectionPopupControls) => void
}) {
  const controls = useSelectionPopup({ onCommit, getSurface: () => surface })
  onReady(controls)
  const [clicks, setClicks] = useState(0)
  return (
    <div data-surface>
      <button type="button" data-clicks={clicks} onClick={() => { setClicks(clicks + 1) }}>elsewhere</button>
      {controls.popup !== null && (
        <button type="button" ref={controls.buttonRef} data-popup onClick={controls.commit}>
          {`${controls.popup.insert}@${controls.popup.left},${controls.popup.top}`}
        </button>
      )}
    </div>
  )
}

function mount(onCommit = vi.fn(), surface: HTMLElement | null = null) {
  let controls: SelectionPopupControls | undefined
  const view = render(
    <Host onCommit={onCommit} surface={surface} onReady={(next) => { controls = next }} />,
  )
  const current = (): SelectionPopupControls => {
    if (controls === undefined) throw new Error('expected the hook to hand back its controls')
    return controls
  }
  const popup = (): HTMLButtonElement | null => view.container.querySelector('[data-popup]')
  return { view, current, popup, onCommit }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('selection popup — anchoring', () => {
  it('keeps an anchor that already sits inside the viewport margins', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    expect(popup()?.textContent).toBe('payload@400,120')
  })

  it('pulls an anchor at the left edge to the margin', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 10, 120) })
    expect(popup()?.textContent).toBe('payload@80,120')
  })

  it('pulls an anchor at the right edge to the margin', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', window.innerWidth - 10, 120) })
    expect(popup()?.textContent).toBe(`payload@${window.innerWidth - 80},120`)
  })

  it('hides on request', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    act(() => { current().hide() })
    expect(popup()).toBeNull()
  })
})

describe('selection popup — committing', () => {
  it('commits the payload and hides', () => {
    const { current, popup, onCommit } = mount()
    act(() => { current().show('payload', 400, 120) })
    fireEvent.click(popup() as HTMLButtonElement)
    expect(onCommit).toHaveBeenCalledWith('payload')
    expect(popup()).toBeNull()
  })

  it('commits nothing when no button is shown', () => {
    const { current, onCommit } = mount()
    act(() => { current().commit() })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('keeps the selection alive through the button press', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    fireEvent.mouseDown(popup() as HTMLButtonElement)
    expect(popup()).not.toBeNull()
  })
})

describe('selection popup — dismissal', () => {
  it('closes on a press outside the button', () => {
    const { current, popup, view } = mount()
    act(() => { current().show('payload', 400, 120) })
    fireEvent.mouseDown(view.container.querySelector('[data-clicks]') as HTMLElement)
    expect(popup()).toBeNull()
  })

  it('stays on a press inside the button', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    fireEvent.mouseDown(popup() as HTMLButtonElement)
    expect(popup()).not.toBeNull()
  })

  it('ignores a press while no button is shown', () => {
    const { popup, view } = mount()
    fireEvent.mouseDown(view.container.querySelector('[data-clicks]') as HTMLElement)
    expect(popup()).toBeNull()
  })

  it('closes on a press that lands before the button has mounted', () => {
    const { current, popup } = mount()
    // Outside `act`: the pending state update is not committed yet, so the
    // listener runs with no button element to exempt.
    current().show('payload', 400, 120)
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(popup()).toBeNull()
  })

  it('closes on Escape', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(popup()).toBeNull()
  })

  it('ignores any other key', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(popup()).not.toBeNull()
  })

  it('closes while the document is hidden', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    try {
      fireEvent(document, new Event('visibilitychange'))
      expect(popup()).toBeNull()
    } finally {
      hidden.mockRestore()
    }
  })

  it('stays while the document is visible', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    fireEvent(document, new Event('visibilitychange'))
    expect(popup()).not.toBeNull()
  })

  it('closes when the window loses focus', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    fireEvent.blur(window)
    expect(popup()).toBeNull()
  })

  it('applies no observer when the environment has none', () => {
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    expect(typeof IntersectionObserver).toBe('undefined')
    expect(popup()).not.toBeNull()
  })

  it('applies no observer without a surface', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    const { current, popup } = mount()
    act(() => { current().show('payload', 400, 120) })
    expect(FakeIntersectionObserver.latest).toBeUndefined()
    expect(popup()).not.toBeNull()
  })

  it('closes when the surface leaves the viewport, and stays while it is inside', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    const surface = document.createElement('div')
    document.body.append(surface)
    try {
      const { current, popup } = mount(vi.fn(), surface)
      act(() => { current().show('payload', 400, 120) })
      const observer = FakeIntersectionObserver.latest
      if (observer === undefined) throw new Error('expected the surface to be observed')
      expect(observer.observed).toEqual([surface])
      act(() => { observer.enter(surface) })
      expect(popup()).not.toBeNull()
      act(() => { observer.leave(surface) })
      expect(popup()).toBeNull()
    } finally {
      surface.remove()
    }
  })

  it('disconnects its observer when the host goes away', () => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    const surface = document.createElement('div')
    const { current, view } = mount(vi.fn(), surface)
    act(() => { current().show('payload', 400, 120) })
    const observer = FakeIntersectionObserver.latest
    if (observer === undefined) throw new Error('expected the surface to be observed')
    view.unmount()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
  })
})
