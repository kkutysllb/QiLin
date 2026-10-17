// @vitest-environment jsdom
/** useAnchoredMaxHeight: viewport-fit clamping for bottom-anchored overlays. */
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useAnchoredMaxHeight } from '../src/useAnchoredMaxHeight.ts'

const CAP = 400

function Probe({ cap = CAP, signal, attach = true }: { cap?: number; signal?: unknown; attach?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const maxHeight = useAnchoredMaxHeight(ref, cap, signal)
  return <div data-testid={attach ? 'overlay' : 'closed'} ref={attach ? ref : undefined} data-max-height={maxHeight} />
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useAnchoredMaxHeight', () => {
  it('keeps the design cap while the overlay is closed', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 100 } as DOMRect)
    const view = render(<Probe attach={false} />)
    expect(view.getByTestId('closed').dataset.maxHeight).toBe(String(CAP))
  })

  it('clamps to the space between the anchored edge and the viewport top', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 100 } as DOMRect)
    const view = render(<Probe />)
    expect(view.getByTestId('overlay').dataset.maxHeight).toBe('88')
  })

  it('never clamps below zero', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 5 } as DOMRect)
    const view = render(<Probe />)
    expect(view.getByTestId('overlay').dataset.maxHeight).toBe('0')
  })

  it('re-fits on window resize and on a scroll anywhere', () => {
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 300 } as DOMRect)
    const view = render(<Probe />)
    expect(view.getByTestId('overlay').dataset.maxHeight).toBe('288')
    rect.mockReturnValue({ bottom: 150 } as DOMRect)
    fireEvent(window, new Event('resize'))
    expect(view.getByTestId('overlay').dataset.maxHeight).toBe('138')
    rect.mockReturnValue({ bottom: 50 } as DOMRect)
    fireEvent.scroll(window)
    expect(view.getByTestId('overlay').dataset.maxHeight).toBe('38')
  })

  it('re-measures when the render signal moves and releases both listeners', () => {
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 200 } as DOMRect)
    const remove = vi.spyOn(window, 'removeEventListener')
    const view = render(<Probe signal={0} />)
    expect(view.getByTestId('overlay').dataset.maxHeight).toBe('188')
    remove.mockClear()
    rect.mockReturnValue({ bottom: 60 } as DOMRect)
    view.rerender(<Probe signal={1} />)
    expect(view.getByTestId('overlay').dataset.maxHeight).toBe('48')
    expect(remove.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(1)
    expect(remove.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(1)
    view.unmount()
    expect(remove.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(2)
  })
})
