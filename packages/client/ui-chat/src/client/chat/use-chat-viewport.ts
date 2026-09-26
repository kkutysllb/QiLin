/** Scrollport geometry and element lookup for Chat, without follow or history policy. */
import { useRef, type MutableRefObject, type RefObject } from 'react'
import type { ChatScrollPosition } from '../contract/slots.ts'

/** Distance from the scroll floor that still counts as pinned to the tail. */
export const FOLLOW_THRESHOLD = 24

/**
 * Resolve the scrollport that owns a Chat column: an enclosing conversation
 * scroll host when present, otherwise the column itself.
 * @param from - the Chat list element.
 * @returns the element that actually scrolls.
 */
export function scrollerOf(from: HTMLElement): HTMLElement {
  return (from.closest('[data-conversation-scroll]')) ?? from
}

/**
 * Attribute a scroll delivery to the reader. Browser shrink clamps and recorded
 * programmatic writes do not transfer scroll ownership.
 * @param top - current scroll position.
 * @param floor - maximum scroll position for the rendered content.
 * @param observedTop - last position delivered or written on the main thread.
 * @returns whether the reader moved the scrollport.
 */
export function readerMovedScroll(top: number, floor: number, observedTop: number): boolean {
  return Math.abs(top - Math.min(observedTop, floor)) > 0.5
}

/** Stable row identity and its offset from the scrollport at the latest user scroll. */
export interface PagingAnchor {
  /** Stable node/call identity, independent of boundary-spanning group keys. */
  key: string
  /** Row top relative to the scrollport after the latest user scroll. */
  top: number
}

/**
 * Find an already-rendered row by its anchor key without interpolating a selector.
 * @param list - the Chat list element.
 * @param key - stable node/call anchor key.
 * @returns the rendered row, or null when the anchor is not mounted.
 */
export function anchorElement(list: HTMLElement, key: string): HTMLElement | null {
  for (const row of list.querySelectorAll<HTMLElement>('[data-chat-anchor-key]:not([hidden])')) {
    if (row.dataset.chatAnchorKey === key) return row
  }
  return null
}

/**
 * Turn owning the row at a scrollport line. Scroll frames are hot, so this
 * hit-tests the line first and falls back to one row scan when layout cannot
 * answer (jsdom, pre-paint); neither path queries per navigation item.
 * @param list - the ChatView list element.
 * @param line - viewport y of the reading line.
 * @returns the Turn number, or null when no loaded row covers the line.
 */
export function turnAtLine(list: HTMLElement, line: number): number | null {
  const content = list.getBoundingClientRect()
  if (typeof document.elementsFromPoint === 'function' && content.width > 0) {
    for (const element of document.elementsFromPoint(content.left + content.width / 2, line)) {
      const row = element instanceof HTMLElement ? element.closest<HTMLElement>('[data-chat-turn]') : null
      const turn = Number(row?.dataset.chatTurn)
      if (row !== null && list.contains(row) && Number.isSafeInteger(turn)) return turn
    }
  }
  let found: number | null = null
  for (const row of list.querySelectorAll<HTMLElement>('[data-chat-turn]')) {
    if (row.getBoundingClientRect().top > line) break
    const turn = Number(row.dataset.chatTurn)
    if (Number.isSafeInteger(turn)) found = turn
  }
  return found
}

/**
 * Row position in scrollport coordinates.
 * @param row - the anchor row.
 * @param scrollport - the owning scrollport.
 * @returns the row's top offset relative to the scrollport, independent of the viewport offset.
 */
export function flowTop(row: HTMLElement, scrollport: HTMLElement): number {
  return row.getBoundingClientRect().top - scrollport.getBoundingClientRect().top
}

/**
 * Select a visible stable node/call identity, falling back only when layout has
 * not exposed a visible box yet.
 * @param list - the Chat list element.
 * @param scrollport - the owning scrollport.
 * @returns the row that owns the reading edge, or null when no row is rendered.
 */
export function pagingAnchor(list: HTMLElement, scrollport: HTMLElement): HTMLElement | null {
  const viewport = scrollport.getBoundingClientRect()
  const composer = scrollport.querySelector<HTMLElement>('[data-composer-seat]')
  const visibleBottom = composer?.getBoundingClientRect().top ?? viewport.bottom
  // The leading edge preserves nested call identity when it hits a row.
  // Chrome/gap misses use logarithmic layout reads over the ordered flex rows.
  if (typeof document.elementsFromPoint === 'function' && visibleBottom > viewport.top) {
    const content = list.getBoundingClientRect()
    const left = Math.max(viewport.left, content.left)
    const right = Math.min(viewport.right, content.right)
    const x = left + Math.max(0, right - left) / 2
    for (const element of document.elementsFromPoint(x, viewport.top + 1)) {
      const row = element instanceof HTMLElement
        ? element.closest<HTMLElement>('[data-chat-anchor-key]')
        : null
      if (row !== null && list.contains(row)) return row
    }
  }
  const rows = list.querySelectorAll<HTMLElement>(
    '[data-chat-flow] > [data-chat-flow-key]:not(:empty):not([hidden])',
  )
  let low = 0
  let high = rows.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (rows.item(middle).getBoundingClientRect().bottom > viewport.top) high = middle
    else low = middle + 1
  }
  const row = rows[low]
  return row !== undefined && row.getBoundingClientRect().top < visibleBottom ? row : rows[0] ?? null
}

/**
 * Capture a reflow-resistant reader position from the current rendered window.
 * @param list - the Chat list element.
 * @param scrollport - the owning scrollport.
 * @returns the semantic reading position, or null when no anchor resolves.
 */
export function scrollPosition(list: HTMLElement, scrollport: HTMLElement): ChatScrollPosition | null {
  const row = pagingAnchor(list, scrollport)
  const anchorKey = row?.dataset.chatAnchorKey
  if (row === null || anchorKey === undefined) return null
  return {
    anchorKey,
    anchorTop: flowTop(row, scrollport),
    scrollTop: scrollport.scrollTop,
  }
}

/** Element refs and the shared position ledger of one Chat scrollport. */
export interface ChatViewportRefs {
  /** The Chat list element; its closest conversation scroll host owns scrolling when present. */
  readonly listRef: RefObject<HTMLDivElement>
  /** Ordered outer Node/Group boxes; the size observer and turn lookup read it. */
  readonly columnRef: RefObject<HTMLDivElement>
  /** Last position delivered or written on the main thread. */
  readonly observedTopRef: MutableRefObject<number>
  /** Paging anchor: semantic row/position at click, updated by reader scrolls
   *  while the request is pending and restored after the prepend lands. */
  readonly anchorRef: MutableRefObject<PagingAnchor | null>
  /** The reader's own last sample while they own the transcript; a layout
   *  change keeps that row on its offset the way a prepend keeps the paging one. */
  readonly readerAnchorRef: MutableRefObject<{ key: string; top: number } | null>
}

/**
 * Own the Chat scrollport's element refs and its shared position ledger.
 * @returns the list/column refs and the position refs shared by reading and navigation policy.
 */
export function useChatViewport(): ChatViewportRefs {
  const listRef = useRef<HTMLDivElement | null>(null)
  const columnRef = useRef<HTMLDivElement | null>(null)
  const observedTopRef = useRef(0)
  const anchorRef = useRef<PagingAnchor | null>(null)
  const readerAnchorRef = useRef<{ key: string; top: number } | null>(null)
  return { listRef, columnRef, observedTopRef, anchorRef, readerAnchorRef }
}
