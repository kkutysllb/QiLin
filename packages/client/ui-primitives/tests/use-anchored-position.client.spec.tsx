// @vitest-environment jsdom
/**
 * `useAnchoredPosition` wiring: a floating panel is placed from its anchor and
 * keeps tracking it while open.
 *
 * The geometry itself needs real layout, which jsdom does not provide. What
 * is asserted here is the wiring the clamp depends on: the
 * listeners and the panel-size observer are attached while open and released on
 * close, a size change replays the placement, and the hook still works where
 * `ResizeObserver` does not exist.
 */
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useAnchoredPosition } from '../src/useAnchoredPosition.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** One recorded `ResizeObserver` instance, so a test can drive its callback. */
interface Recorded {
  callback: ResizeObserverCallback
  observed: Element[]
  disconnected: boolean
}

/**
 * Install a recording `ResizeObserver` double.
 * @returns the list every constructed observer registers itself in.
 */
function stubResizeObserver(): Recorded[] {
  const made: Recorded[] = []
  vi.stubGlobal('ResizeObserver', class {
    private readonly record: Recorded

    constructor(callback: ResizeObserverCallback) {
      this.record = { callback, observed: [], disconnected: false }
      made.push(this.record)
    }

    observe(element: Element) { this.record.observed.push(element) }
    disconnect() { this.record.disconnected = true }
  })
  return made
}

/**
 * Host component that anchors a panel and reports the computed position.
 * @param props - whether the panel is open.
 * @returns the anchor and, while open, the panel carrying the position.
 */
function Host({ open, align }: { open: boolean; align?: 'start' | 'end' }) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const position = useAnchoredPosition({ open, anchorRef, panelRef, gap: 4, margin: 12, ...align === undefined ? {} : { align } })
  return (
    <>
      <button ref={anchorRef} type="button">anchor</button>
      {open && <div ref={panelRef} data-testid="panel" style={position ?? { visibility: 'hidden' }} />}
    </>
  )
}

/**
 * Host exercising the optional options; the panel stays mounted so the
 * variables the hook owns can be read after it closes.
 * @param props - placement options under test.
 * @returns the anchor and the always-mounted panel.
 */
function OptionHost({
  open, side, minWidthFromAnchor = false, getAnchorRect, layoutKey,
}: {
  open: boolean
  side?: 'top' | 'bottom' | 'right'
  minWidthFromAnchor?: boolean
  getAnchorRect?: () => DOMRect | null
  layoutKey?: string | number
}) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const position = useAnchoredPosition({
    open, anchorRef, panelRef, gap: 4, margin: 12,
    ...side === undefined ? {} : { side },
    ...getAnchorRect === undefined ? {} : { getAnchorRect },
    ...layoutKey === undefined ? {} : { layoutKey },
    minWidthFromAnchor,
  })
  return (
    <>
      <button ref={anchorRef} type="button">anchor</button>
      <div ref={panelRef} data-testid="panel" style={position ?? { visibility: 'hidden' }} />
    </>
  )
}

describe('useAnchoredPosition', () => {
  it('lines the panel up with the anchor\'s right edge when aligned to the end', () => {
    // jsdom lays nothing out: the anchor's rect and the panel's width are stated, and the placement read back.
    const rect = { left: 100, right: 300, top: 10, bottom: 30, width: 200, height: 20, x: 100, y: 10, toJSON: () => ({}) } as DOMRect
    const anchorRect = vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
    const width = vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(120)
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 800)
    try {
      const { getByTestId, rerender } = render(<Host open align="end" />)
      expect(getByTestId('panel').style.left).toBe('180px')
      expect(getByTestId('panel').style.top).toBe('34px')
      rerender(<Host open />)
      expect(getByTestId('panel').style.left).toBe('100px')
    } finally {
      anchorRect.mockRestore()
      width.mockRestore()
    }
  })

  it('observes the panel while open and disconnects when it closes', () => {
    const made = stubResizeObserver()
    const ui = render(<Host open />)

    expect(made).toHaveLength(1)
    // The anchor is observed too: its own resize moves the panel.
    expect(made[0]?.observed).toEqual([ui.getByRole('button'), ui.getByTestId('panel')])
    expect(made[0]?.disconnected).toBe(false)

    ui.rerender(<Host open={false} />)

    expect(made[0]?.disconnected).toBe(true)
  })

  it('replaces the panel when its own size changes', () => {
    const made = stubResizeObserver()
    render(<Host open />)
    const before = made[0]?.callback
    expect(before).toBeDefined()

    // A status line appearing inside the panel, or a dragged textarea, changes
    // the height without a scroll or resize event; the observer is the only
    // thing that notices, so driving its callback must not throw.
    expect(() => { before?.([], {} as ResizeObserver) }).not.toThrow()
  })

  it('still places the panel where ResizeObserver does not exist', () => {
    // jsdom's own condition, and any host without the API: the hook must fall
    // back to scroll and resize rather than fail at mount.
    vi.stubGlobal('ResizeObserver', undefined)

    expect(() => render(<Host open />)).not.toThrow()
  })

  it('publishes the visible-viewport caps under both variable names', () => {
    const rect = { left: 100, right: 300, top: 10, bottom: 30, width: 200, height: 20, x: 100, y: 10, toJSON: () => ({}) } as DOMRect
    const anchorRect = vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 800)
    try {
      const { getByTestId, rerender } = render(<OptionHost open />)
      const panel = getByTestId('panel')
      expect(panel.style.getPropertyValue('--qilin-anchored-max-width')).toBe('976px')
      expect(panel.style.getPropertyValue('--qilin-anchored-max-height')).toBe('776px')
      // Third-party sheets still read the earlier names.
      expect(panel.style.getPropertyValue('--dsh-anchored-max-width')).toBe('976px')
      expect(panel.style.getPropertyValue('--dsh-anchored-max-height')).toBe('776px')
      // Closing restores whatever the panel declared before the hook ran.
      rerender(<OptionHost open={false} />)
      expect(panel.style.getPropertyValue('--qilin-anchored-max-width')).toBe('')
      expect(panel.style.getPropertyValue('--dsh-anchored-max-width')).toBe('')
    } finally {
      anchorRect.mockRestore()
    }
  })

  it('places a right-side panel beside the anchor at its top edge', () => {
    const rect = { left: 100, right: 300, top: 10, bottom: 30, width: 200, height: 20, x: 100, y: 10, toJSON: () => ({}) } as DOMRect
    const anchorRect = vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 800)
    try {
      const { getByTestId } = render(<OptionHost open side="right" />)
      expect(getByTestId('panel').style.left).toBe('304px')
      // The viewport margin is the floor: an anchor above it cannot pull the
      // panel past the edge it must keep.
      expect(getByTestId('panel').style.top).toBe('12px')
    } finally {
      anchorRect.mockRestore()
    }
  })

  it('prefers the host rect and keeps the panel at least as wide as the anchor', () => {
    const anchorRect = vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 0, right: 40, top: 0, bottom: 20, width: 40, height: 20, x: 0, y: 0, toJSON: () => ({}) },
    )
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 800)
    const hostRect = { left: 120, right: 420, top: 40, bottom: 60, width: 300, height: 20, x: 120, y: 40, toJSON: () => ({}) } as DOMRect
    try {
      const { getByTestId } = render(
        <OptionHost open minWidthFromAnchor getAnchorRect={() => hostRect} />,
      )
      const panel = getByTestId('panel')
      expect(panel.style.left).toBe('120px')
      expect(panel.style.top).toBe('64px')
      expect(panel.style.minWidth).toBe('300px')
    } finally {
      anchorRect.mockRestore()
    }
  })

  it('re-measures a committed content change named by layoutKey', () => {
    let left = 100
    const anchorRect = vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ left, right: left + 100, top: 10, bottom: 30, width: 100, height: 20, x: left, y: 10, toJSON: () => ({}) }),
    )
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 800)
    try {
      const { getByTestId, rerender } = render(<OptionHost open layoutKey={1} />)
      expect(getByTestId('panel').style.left).toBe('100px')
      // The frame loop also notices, but the committed-change key places the
      // new geometry within the same layout pass.
      left = 220
      rerender(<OptionHost open layoutKey={2} />)
      expect(getByTestId('panel').style.left).toBe('220px')
      rerender(<OptionHost open layoutKey={2} />)
      expect(getByTestId('panel').style.left).toBe('220px')
    } finally {
      anchorRect.mockRestore()
    }
  })

  it('attaches no listeners while the element is closed', () => {
    const made = stubResizeObserver()
    const add = vi.spyOn(window, 'addEventListener')

    render(<Host open={false} />)

    expect(made).toHaveLength(0)
    expect(add.mock.calls.filter(([type]) => type === 'scroll' || type === 'resize')).toEqual([])
    add.mockRestore()
  })
})
