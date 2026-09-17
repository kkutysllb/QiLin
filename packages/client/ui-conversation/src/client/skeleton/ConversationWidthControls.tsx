import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ConversationWidthControlsProps } from '../contract/slots.ts'
import { CONTENT_WIDTH_ADAPTIVE, CONTENT_WIDTH_MIN } from '../../conversation-settings.ts'
import css from './ConversationRoot.module.css'

/** Horizontal room reserved for both handles and their safe edge zones. */
const CONTENT_EDGE_BUDGET = 176
const WHEEL_DELTA_LINE = 1
const WHEEL_DELTA_PAGE = 2
const FALLBACK_WHEEL_LINE_PX = 16

/** Resolve the width displayed for one measured Conversation column.
 * @param columnWidth - the Conversation body's rendered width in px.
 * @param stored - the durable content width, or {@link CONTENT_WIDTH_ADAPTIVE} for the layout clamp.
 * @returns the resolved content width in px (mirrors the CSS clamp). */
function resolveContentWidth(columnWidth: number, stored: number): number {
  const max = Math.max(CONTENT_WIDTH_MIN, columnWidth - CONTENT_EDGE_BUDGET)
  if (stored !== CONTENT_WIDTH_ADAPTIVE) return Math.min(Math.max(stored, CONTENT_WIDTH_MIN), max)
  return Math.max(680, Math.min(columnWidth * 0.64, 920))
}

/** Convert a wheel event's vertical delta to scrollport pixels. */
function wheelDeltaY(event: React.WheelEvent, scrollport: HTMLElement): number {
  if (event.deltaMode === WHEEL_DELTA_LINE) {
    const lineHeight = Number.parseFloat(getComputedStyle(scrollport).lineHeight)
    return event.deltaY * (Number.isFinite(lineHeight) ? lineHeight : FALLBACK_WHEEL_LINE_PX)
  }
  if (event.deltaMode === WHEEL_DELTA_PAGE) return event.deltaY * scrollport.clientHeight
  return event.deltaY
}

/** One pointer-captured transcript width handle. */
function WidthHandle(props: {
  side: 'left' | 'right'
  onStart: () => number
  onDrag: (width: number) => void
  onCommit: (width: number) => void
  onEnd: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const base = useRef(0)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef(props)
  callbacks.current = props

  const outwardWidth = () => {
    const dx = latest.current - origin.current
    const outward = callbacks.current.side === 'right' ? dx : -dx
    return base.current + outward * 2
  }
  const cancelFrame = () => {
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
  }
  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = event.clientX
    latest.current = event.clientX
    base.current = callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--qilin-width-handle-pointer-y', `${event.clientY - box.top}px`)
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    latest.current = event.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(outwardWidth())
    })
  }, [])
  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    cancelFrame()
    latest.current = event.clientX
    // A press-only gesture must not overwrite a wider preference with its window-clamped display value.
    if (latest.current !== origin.current) callbacks.current.onCommit(outwardWidth())
    setDragging(false)
    callbacks.current.onEnd()
  }, [])
  const onPointerCancel = useCallback(() => {
    // Cancellation abandons persistence and restores the saved width through onEnd.
    cancelFrame()
    setDragging(false)
    callbacks.current.onEnd()
  }, [])
  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const body = event.currentTarget.parentElement
    /* v8 ignore next -- a width handle renders only inside the Conversation body. */
    if (body === null) return
    const scrollport = body.querySelector<HTMLElement>(':scope > [data-conversation-scroll]')
    /* v8 ignore next -- the Conversation body always contains its direct scroll element. */
    if (scrollport === null) return
    if (event.ctrlKey || event.deltaY === 0) return
    scrollport.scrollBy({ top: wheelDeltaY(event, scrollport) })
  }, [])

  return (
    <div
      className={css.widthHandle}
      data-side={props.side}
      data-width-handle={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onWheel={onWheel}
    />
  )
}

/**
 * Install the main Conversation width axis and render its drag handles.
 *
 * The width is the Host settings document's durable value, read through the
 * injected content-width hook and written back through `setContentWidth`, so a
 * drag and the Settings row share one source of truth. The preference is read
 * through a ref, so a width change never rebuilds the measurement observer; the
 * second effect republishes when it moves.
 * @param props - Mounted Conversation body, presentation phase, and the durable width share.
 * @returns two active-phase width handles, or no controls outside the active phase.
 */
export function ConversationWidthControls({
  container, phase, useContentWidth, setContentWidth,
}: ConversationWidthControlsProps) {
  const widthPreference = useContentWidth(value => value)
  const storedWidth = useRef(widthPreference)
  storedWidth.current = widthPreference
  const publishWidths = useCallback((container: HTMLDivElement): void => {
    const target = container.parentElement ?? container
    const column = container.offsetWidth
    target.style.setProperty('--qilin-conversation-column-width', `${column}px`)
    const stored = storedWidth.current
    if (stored === CONTENT_WIDTH_ADAPTIVE) target.style.removeProperty('--qilin-chat-user-width')
    else target.style.setProperty('--qilin-chat-user-width', `${resolveContentWidth(column, stored)}px`)
  }, [])

  useLayoutEffect(() => {
    if (container === null) return
    const observer = new ResizeObserver(() => { publishWidths(container) })
    observer.observe(container)
    publishWidths(container)
    return () => { observer.disconnect() }
  }, [container, publishWidths])
  useLayoutEffect(() => {
    if (container !== null) publishWidths(container)
  }, [container, widthPreference, publishWidths])

  const onStart = useCallback((): number => {
    /* v8 ignore next -- handles render only with a mounted body, so the container is always present. */
    if (container === null) return 680
    return resolveContentWidth(container.offsetWidth, storedWidth.current)
  }, [container])
  const onDrag = useCallback((width: number): void => {
    /* v8 ignore next -- handles render only with a mounted body, so the container is always present. */
    if (container === null) return
    const target = container.parentElement ?? container
    target.style.setProperty('--qilin-chat-user-width', `${resolveContentWidth(container.offsetWidth, width)}px`)
  }, [container])
  const onCommit = useCallback((width: number): void => {
    /* v8 ignore next -- handles render only with a mounted body, so the container is always present. */
    if (container === null) return
    setContentWidth(resolveContentWidth(container.offsetWidth, width))
  }, [container, setContentWidth])
  const onEnd = useCallback((): void => {
    if (container !== null) publishWidths(container)
  }, [container, publishWidths])

  if (container === null || phase !== 'active') return null
  return (['left', 'right'] as const).map(side => (
    <WidthHandle
      key={side}
      side={side}
      onStart={onStart}
      onDrag={onDrag}
      onCommit={onCommit}
      onEnd={onEnd}
    />
  ))
}
