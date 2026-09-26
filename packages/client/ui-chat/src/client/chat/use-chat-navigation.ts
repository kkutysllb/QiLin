/** Turn jumps and history-prepend anchoring for Chat, independent of DOM ownership. */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { SessionSeq } from '@qilin/session/types'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import type { ChatReadingState } from './use-chat-reading.ts'
import { anchorElement, flowTop, pagingAnchor, scrollerOf, type ChatViewportRefs } from './use-chat-viewport.ts'
import type { TurnRailItem } from './turn-rail-items.ts'

/** Committed history availability and the reading policy this navigation drives. */
export interface ChatNavigationInput {
  readonly viewport: ChatViewportRefs
  readonly reading: ChatReadingState
  readonly railItems: readonly TurnRailItem[]
  readonly firstSeq: number | null
  readonly hasMore: boolean
  readonly loadingOlder: boolean
  readonly loadOlder: ChatViewSlotProps['loadOlder']
  readonly loadThrough: ChatViewSlotProps['loadThrough']
}

/** History navigation facts consumed by the scroll composition and the turn rail. */
export interface ChatNavigationState {
  readonly busyTurn: number | null
  /** Unloaded-turn jump in flight: target turn plus its load-through seq. */
  readonly pendingJumpRef: MutableRefObject<{ turn: number; seq: SessionSeq } | null>
  /** {@inheritDoc ChatNavigationInput} */
  readonly navigateToTurn: (item: TurnRailItem) => void
  /** Retain the reading anchor and request one older page. */
  readonly loadEarlier: () => void
  /** Land the pending jump once its Turn has a rendered anchor row; false while it must keep waiting. */
  readonly realizePendingJump: (local: HTMLElement, el: HTMLElement, settle: boolean) => boolean
  /** Release the jump and its busy indicator without cancelling shared history I/O. */
  readonly clearJump: () => void
}

/**
 * Own the replaceable turn jump and the anchor retained while history loads.
 * @param input - scrollport refs, reading policy, committed history state, and load operations.
 * @returns the jump state and the navigation callbacks composition and the rail read.
 */
export function useChatNavigation(input: ChatNavigationInput): ChatNavigationState {
  const { viewport, reading, railItems, firstSeq, hasMore, loadingOlder, loadOlder, loadThrough } = input
  const { listRef, anchorRef } = viewport
  const { atBottomRef, setAtBottom, landOnRowRef } = reading

  /** Unloaded-turn jump in flight: target turn plus its load-through seq. */
  const pendingJumpRef = useRef<{ turn: number; seq: SessionSeq } | null>(null)
  /** Whether the in-flight jump already landed mid-paging (settle then only corrects an untouched landing). */
  const jumpLandedRef = useRef(false)
  const [busyJumpTurn, setBusyJumpTurn] = useState<number | null>(null)
  /** Bumped when a loadThrough completion settles, after its last page's commit. */
  const [jumpSettleTick, setJumpSettleTick] = useState(0)
  /** Window head at the last settle-time repage; an unmoved head falls back instead of repaging forever. */
  const jumpRepageHeadRef = useRef<number | null>(null)

  /**
   * Land the pending jump once its Turn has a rendered anchor row; false
   * while it must keep waiting. Mid-jump landings (`settle` false) keep the
   * jump armed with the target row as the paging anchor, so later chunks and
   * the load-earlier button's unmount re-land on the same row; the settling
   * call clears the jump.
   */
  const realizePendingJump = (local: HTMLElement, el: HTMLElement, settle: boolean): boolean => {
    const pending = pendingJumpRef.current
    if (pending === null) return true
    const item = railItems.find(candidate => candidate.turn === pending.turn)
    if (item === undefined || item.anchor.kind !== 'loaded') return false
    const row = anchorElement(local, item.anchor.key)
    if (row === null) return false
    if (settle) {
      pendingJumpRef.current = null
      setBusyJumpTurn(null)
      const held = anchorRef.current
      const landedEarlier = jumpLandedRef.current
      jumpLandedRef.current = false
      anchorRef.current = null
      // A reader who moved off an already-landed target mid-jump keeps their
      // place; a first landing, or an untouched one, takes the correction.
      if (!landedEarlier || held?.key === item.anchor.key) {
        landOnRowRef.current(local, el, row, pending.turn)
      }
      return true
    }
    landOnRowRef.current(local, el, row, pending.turn)
    jumpLandedRef.current = true
    anchorRef.current = { key: item.anchor.key, top: flowTop(row, el) }
    return true
  }


  const clearJump = (): void => {
    pendingJumpRef.current = null
    setBusyJumpTurn(current => current === null ? current : null)
  }

  // A failed/empty page leaves the head unchanged. Once the request leaves
  // its busy state there is no future prepend for the saved anchor to own.
  useEffect(() => {
    if (!loadingOlder) anchorRef.current = null
  }, [loadingOlder])

  // Jump settlement: every loadThrough completion bumps the tick after its
  // last page's commit, and a plain pull's loadingOlder flip re-settles a
  // jump it made wait. A still-pending jump is realized now, held while a
  // plain load-earlier pull owns the pager (its completion retries below),
  // repaged once per head movement, or landed on the nearest rendered Turn
  // at or after the target (failure, exhausted history, or a Turn with no
  // visible row).
  useEffect(() => {
    const pending = pendingJumpRef.current
    const local = listRef.current
    if (pending === null || local === null) return
    const el = scrollerOf(local)
    // The settling landing runs after the load-earlier button's unmount
    // commit, so the target row cannot drift once the jump clears.
    if (realizePendingJump(local, el, true)) return
    const uncovered = firstSeq === null || firstSeq > pending.seq
    if (uncovered && hasMore) {
      // A plain pull owns the pager right now: hold the jump (busy stays)
      // instead of degrading to a wrong landing.
      if (loadingOlder) return
      if (jumpRepageHeadRef.current !== firstSeq) {
        jumpRepageHeadRef.current = firstSeq
        const held = pagingAnchor(local, el)
        if (held !== null && held.dataset.chatAnchorKey !== undefined) {
          anchorRef.current = { key: held.dataset.chatAnchorKey, top: flowTop(held, el) }
        }
        void loadThrough(pending.seq).finally(() => { setJumpSettleTick(tick => tick + 1) })
        return
      }
    }
    for (const row of local.querySelectorAll<HTMLElement>('[data-chat-turn]:not([hidden])')) {
      const turn = Number(row.dataset.chatTurn)
      if (!Number.isSafeInteger(turn) || turn < pending.turn) continue
      landOnRowRef.current(local, el, row, turn)
      break
    }
    pendingJumpRef.current = null
    setBusyJumpTurn(null)
    // Snapshot values are read at settle time; the completion tick is the trigger.
  }, [jumpSettleTick])

  // A jump held while a plain pull owned the pager waits in the effect
  // above; the pull's completion is its retry signal.
  useEffect(() => {
    if (!loadingOlder && pendingJumpRef.current !== null) setJumpSettleTick(tick => tick + 1)
  }, [loadingOlder])

  const loadOlderAnchored = (): void => {
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: the paging button renders inside the list tree. */
    if (local !== null) {
      const el = scrollerOf(local)
      const row = pagingAnchor(local, el)
      if (row !== null && row.dataset.chatAnchorKey !== undefined) {
        anchorRef.current = {
          key: row.dataset.chatAnchorKey,
          top: flowTop(row, el),
        }
      }
    }
    loadOlder()
  }

  // Identity feeds the memoized rail; a fresh closure per render would defeat it.
  const navigateToTurn = useCallback((item: TurnRailItem): void => {
    const local = listRef.current
    if (local === null) return
    const el = scrollerOf(local)
    if (item.anchor.kind === 'unloaded') {
      // Jumping into history is leaving the live tail: release bottom
      // ownership on the click itself, or the pinned-scroll snap (a
      // non-reader scroll delivery during the first prepend's compensation)
      // would call toBottom and cancel the jump.
      atBottomRef.current = false
      setAtBottom(false)
      // Hold the reader's place through the paging chunks; the layout effect
      // lands on the target once its rows commit.
      const held = pagingAnchor(local, el)
      if (held !== null && held.dataset.chatAnchorKey !== undefined) {
        anchorRef.current = { key: held.dataset.chatAnchorKey, top: flowTop(held, el) }
      }
      pendingJumpRef.current = { turn: item.turn, seq: item.anchor.seq }
      jumpRepageHeadRef.current = null
      jumpLandedRef.current = false
      setBusyJumpTurn(item.turn)
      void loadThrough(item.anchor.seq).finally(() => { setJumpSettleTick(tick => tick + 1) })
      return
    }
    const row = anchorElement(local, item.anchor.key)
    if (row === null) return
    // A loaded-mark click supersedes any jump still landing.
    pendingJumpRef.current = null
    setBusyJumpTurn(current => current === null ? current : null)
    landOnRowRef.current(local, el, row, item.turn)
    // A pending older page still has to compensate the prepended height, so
    // navigation moves that anchor to the new position instead of dropping it.
    const landed = loadingOlder ? pagingAnchor(local, el) : null
    anchorRef.current = landed === null || landed.dataset.chatAnchorKey === undefined
      ? null
      : { key: landed.dataset.chatAnchorKey, top: flowTop(landed, el) }
  }, [loadingOlder, loadThrough])

  return { busyTurn: busyJumpTurn, pendingJumpRef, navigateToTurn, loadEarlier: loadOlderAnchored, realizePendingJump, clearJump }
}
