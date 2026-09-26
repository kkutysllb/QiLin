/** Follow-tail ownership, sampled reader movement, and the active-turn mark for Chat. */
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type Dispatch, type MutableRefObject, type SetStateAction,
} from 'react'
import type { ChatSnapshot } from '../contract/snapshot.ts'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import {
  FOLLOW_THRESHOLD, anchorElement, flowTop, readerMovedScroll, scrollPosition, scrollerOf, turnAtLine,
  type ChatViewportRefs,
} from './use-chat-viewport.ts'

/** Interval before unsettled reader movement is sampled as the new reading position. */
export const SCROLL_SAMPLE_INTERVAL_MS = 500

/** Committed content, scroll memory, and the tail-returning action this policy drives. */
export interface ChatReadingInput {
  readonly viewport: ChatViewportRefs
  readonly chatScroll: ChatViewSlotProps['chatScroll']
  readonly turnNavigationItems: ReturnType<ChatSnapshot['navigation']['items']>
  /** Tail return owned by the scroll composition; read lazily so neither hook depends on declaration order. */
  readonly toBottomRef: MutableRefObject<((el: HTMLElement) => void) | null>
}

/** Reading facts and refs consumed by history navigation and the scroll composition. */
export interface ChatReadingState {
  readonly atBottom: boolean
  readonly atBottomRef: MutableRefObject<boolean>
  readonly setAtBottom: Dispatch<SetStateAction<boolean>>
  readonly activeTurn: number | null
  readonly setActiveTurn: Dispatch<SetStateAction<number | null>>
  /** Whether reader input still awaits its sampling interval or the browser's \`scrollend\`. */
  readonly scrollSamplePendingRef: MutableRefObject<boolean>
  /** Land one row at the reading line and republish scroll-derived state. */
  readonly landOnRowRef: MutableRefObject<(local: HTMLElement, el: HTMLElement, row: HTMLElement, turn: number) => void>
}

/**
 * Own follow-tail intent, reader sampling, and the active-turn mark, without DOM ownership.
 * @param input - scrollport refs, scroll memory, loaded turns, and the tail-return action.
 * @returns the reading state and the refs history navigation and composition read.
 */
export function useChatReading(input: ChatReadingInput): ChatReadingState {
  const { viewport, chatScroll, turnNavigationItems, toBottomRef } = input
  const { listRef, columnRef, observedTopRef, anchorRef, readerAnchorRef } = viewport

  // A saved position starts disarmed; the first layout effect synchronously
  // restores it and normalizes a floor-clamped position back to following.
  const [atBottom, setAtBottom] = useState(() => chatScroll.read() === null)
  const atBottomRef = useRef(atBottom)
  const scrollSamplePendingRef = useRef(false)
  const [, setScrollSampleTick] = useState(0)
  const [activeTurn, setActiveTurn] = useState<number | null>(
    () => turnNavigationItems.at(-1)?.turn ?? null,
  )

  const syncActiveTurn = useCallback((): void => {
    if (scrollSamplePendingRef.current) return
    const local = listRef.current
    const first = turnNavigationItems[0]
    if (local === null || first === undefined) {
      setActiveTurn(null)
      return
    }
    const el = scrollerOf(local)
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD + 1) {
      const latest = turnNavigationItems.at(-1)?.turn ?? first.turn
      setActiveTurn(current => current === latest ? current : latest)
      return
    }
    const readingLine = el.getBoundingClientRect().top + Math.min(96, el.clientHeight * 0.2)
    const reading = turnAtLine(local, readingLine)
    // No row reaches the line yet: the flow head still owns the mark. Otherwise
    // the row's Turn may be one the rail does not offer (all its nodes hidden),
    // so the newest offered Turn at or above it owns the mark.
    let next = first.turn
    if (reading !== null) {
      for (const item of turnNavigationItems) {
        if (item.turn > reading) break
        next = item.turn
      }
    }
    setActiveTurn(current => current === next ? current : next)
  }, [turnNavigationItems])

  const activeTurnRef = useRef<(() => void) | null>(null)
  const activeFrameRef = useRef<number | null>(null)
  const scheduleActiveTurn = useCallback((): void => {
    if (activeFrameRef.current !== null) return
    if (typeof requestAnimationFrame === 'undefined') {
      syncActiveTurn()
      return
    }
    activeFrameRef.current = requestAnimationFrame(() => {
      activeFrameRef.current = null
      syncActiveTurn()
    })
  }, [syncActiveTurn])

  useEffect(() => () => {
    if (activeFrameRef.current !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(activeFrameRef.current)
    }
  }, [])

  activeTurnRef.current = scheduleActiveTurn

  useLayoutEffect(() => {
    scheduleActiveTurn()
  }, [scheduleActiveTurn])

  // Land a row at the reading line and republish scroll-derived state. A
  // latest-ref, so navigateToTurn's identity stays stable for the memoized rail.
  const landOnRowRef = useRef<(local: HTMLElement, el: HTMLElement, row: HTMLElement, turn: number) => void>(
    () => {},
  )
  landOnRowRef.current = (local, el, row, turn) => {
    el.scrollTop += flowTop(row, el) - 24
    observedTopRef.current = el.scrollTop
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD + 1
    atBottomRef.current = isAtBottom
    setAtBottom(isAtBottom)
    setActiveTurn(turn)
    const position = isAtBottom ? null : scrollPosition(local, el)
    if (isAtBottom) chatScroll.save(null)
    else if (position !== null) chatScroll.save(position)
  }

  const onScrollRef = useRef(() => {})
  onScrollRef.current = () => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: the handler only fires while mounted. */
    if (local === null) return
    const el = scrollerOf(local)
    // Only reader input may make raw scroll geometry change follow ownership:
    // a delivered position that deviates from the observed-top ledger (every
    // programmatic write records itself there synchronously). This covers
    // wheel, touch, scrollbar, and keyboard alike without naming devices.
    // Browser shrink-clamps land exactly on the floor min and delayed
    // programmatic deliveries land on the ledger itself, so both preserve
    // the current ownership state.
    const floor = Math.max(0, el.scrollHeight - el.clientHeight)
    const movedByReader = readerMovedScroll(el.scrollTop, floor, observedTopRef.current)
    const isAtBottom = movedByReader
      ? floor - el.scrollTop <= FOLLOW_THRESHOLD + 1
      : atBottomRef.current
    if (!movedByReader && isAtBottom) {
      toBottomRef.current?.(el)
      return
    }
    atBottomRef.current = isAtBottom
    setAtBottom(isAtBottom)
    const position = isAtBottom ? null : scrollPosition(local, el)
    if (isAtBottom) {
      anchorRef.current = null
      readerAnchorRef.current = null
    } else if (position !== null) {
      readerAnchorRef.current = { key: position.anchorKey, top: position.anchorTop }
      if (anchorRef.current !== null) {
        anchorRef.current = { key: position.anchorKey, top: position.anchorTop }
      }
    }
    // Continuous save (unmount happens after ref detach, so saving there is
    // too late); pinned-to-bottom clears so a remount keeps following.
    if (isAtBottom) chatScroll.save(null)
    else if (position !== null) chatScroll.save(position)
    observedTopRef.current = el.scrollTop
    scheduleActiveTurn()
  }

  // Non-reader pinned deliveries must settle before layout growth invalidates
  // their floor. Reader movement stays pending even inside the follow threshold,
  // so growth cannot erase small gestures before they accumulate off the floor.
  useEffect(() => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: effect runs after the list node commits. */
    if (local === null) return
    const el = scrollerOf(local)
    let sampleTimer: number | undefined
    const sample = (): void => {
      if (!scrollSamplePendingRef.current) return
      scrollSamplePendingRef.current = false
      if (sampleTimer !== undefined) window.clearTimeout(sampleTimer)
      sampleTimer = undefined
      onScrollRef.current()
      setScrollSampleTick(tick => tick + 1)
    }
    const onScroll = (): void => {
      scrollSamplePendingRef.current = true
      if (atBottomRef.current) {
        const floor = Math.max(0, el.scrollHeight - el.clientHeight)
        if (!readerMovedScroll(el.scrollTop, floor, observedTopRef.current)) {
          sample()
          return
        }
      }
      sampleTimer ??= window.setTimeout(sample, SCROLL_SAMPLE_INTERVAL_MS)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', sample, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', sample)
      if (sampleTimer !== undefined) window.clearTimeout(sampleTimer)
      scrollSamplePendingRef.current = false
    }
  }, [])

  // The ref starts null and is assigned every render, so the placeholder
  // initializer a function initial value would need never exists.
  const followRef = useRef<(() => void) | null>(null)
  followRef.current = () => {
    if (scrollSamplePendingRef.current) return
    const local = listRef.current
    if (local !== null && atBottomRef.current) {
      const el = scrollerOf(local)
      el.scrollTop = el.scrollHeight
      observedTopRef.current = el.scrollTop
      chatScroll.save(null)
    }
  }

  // A layout change (window resize, sidebar reflow, image growth) moves the
  // sampled row without a scroll event, so put it back on its offset.
  const preserveRef = useRef<(() => void) | null>(null)
  preserveRef.current = () => {
    if (scrollSamplePendingRef.current || atBottomRef.current) return
    const local = listRef.current
    const anchor = readerAnchorRef.current
    if (local === null || anchor === null) return
    const el = scrollerOf(local)
    const row = anchorElement(local, anchor.key)
    if (row === null) return
    const delta = flowTop(row, el) - anchor.top
    if (Math.abs(delta) < 0.5) return
    el.scrollTop += delta
    observedTopRef.current = el.scrollTop
  }

  // Streaming, tool disclosures, and other flow changes resize the column;
  // the sticky composer resizes outside it. This observer owns ChatView's
  // dynamic-height follow decisions and writes only while the reader is pinned.
  useEffect(() => {
    const column = columnRef.current
    const local = listRef.current
    if (column === null || local === null || typeof ResizeObserver === 'undefined') return
    const scrollport = scrollerOf(local)
    const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
    // Flow-height changes (image loads, tool disclosures) move rows across the
    // reading line without a scroll event, so the active mark resyncs here too.
    const observer = new ResizeObserver(() => {
      followRef.current?.()
      preserveRef.current?.()
      activeTurnRef.current?.()
    })
    observer.observe(column)
    if (composer !== null) observer.observe(composer)
    return () => { observer.disconnect() }
  }, [])

  return {
    atBottom, atBottomRef, setAtBottom, activeTurn, setActiveTurn, scrollSamplePendingRef, landOnRowRef,
  }
}
