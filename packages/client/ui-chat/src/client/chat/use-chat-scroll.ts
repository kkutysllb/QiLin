/** Composes viewport, reading policy, and history navigation for Chat. */
import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { OpenState, PendingSubmission } from '@qilin/api-session-controller/client'
import type { InboxState } from '@qilin/agent/types'
import type { ChatSnapshot } from '../contract/snapshot.ts'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import type { TurnRailItem } from './turn-rail-items.ts'
import { useChatNavigation } from './use-chat-navigation.ts'
import { useChatReading } from './use-chat-reading.ts'
import {
  FOLLOW_THRESHOLD, anchorElement, flowTop, scrollPosition, scrollerOf, useChatViewport,
} from './use-chat-viewport.ts'

/** Committed Chat content and Session operations the scroll policy reconciles. */
export interface ChatScrollInput {
  readonly chatScroll: ChatViewSlotProps['chatScroll']
  readonly order: readonly string[]
  readonly nodeStore: ChatSnapshot['nodes']
  readonly openState: OpenState
  readonly running: boolean
  readonly loadingOlder: boolean
  readonly hasMore: boolean
  readonly loadOlder: ChatViewSlotProps['loadOlder']
  readonly loadThrough: ChatViewSlotProps['loadThrough']
  readonly turnNavigationItems: ReturnType<ChatSnapshot['navigation']['items']>
  readonly railItems: readonly TurnRailItem[]
  readonly pendingSteering: readonly InboxState['next-step'][number][]
  readonly visibleSubmissions: readonly PendingSubmission[]
}

/** Element refs, visible reading state, and navigation callbacks the Chat shell renders. */
export interface ChatScrollState {
  readonly listRef: RefObject<HTMLDivElement>
  readonly columnRef: RefObject<HTMLDivElement>
  readonly atBottom: boolean
  readonly activeTurn: number | null
  readonly busyTurn: number | null
  readonly navigateToTurn: (item: TurnRailItem) => void
  readonly loadEarlier: () => void
  readonly toBottom: (el: HTMLElement) => void
}

/**
 * Coordinate scroll policy after Chat content commits.
 * @param input - committed Chat content, scroll memory, and history operations.
 * @returns element refs, visible reading state, and navigation callbacks.
 */
export function useChatScroll(input: ChatScrollInput): ChatScrollState {
  const {
    chatScroll, order, nodeStore, openState, running, loadingOlder, hasMore,
    loadOlder, loadThrough, turnNavigationItems, railItems, pendingSteering, visibleSubmissions,
  } = input
  const viewport = useChatViewport()
  const { listRef, columnRef, observedTopRef, anchorRef, readerAnchorRef } = viewport
  // The tail return is defined below, after navigation owns the jump it releases;
  // reading reads it lazily so neither hook depends on declaration order.
  const toBottomRef = useRef<((el: HTMLElement) => void) | null>(null)
  const reading = useChatReading({ viewport, chatScroll, turnNavigationItems, toBottomRef })

  const firstSeqRef = useRef<number | null>(null)
  const openedRef = useRef(false)
  const lastKeyRef = useRef<string | null>(null)
  const lastSteeringIdRef = useRef<string | null>(null)
  const lastSubmissionIdRef = useRef<string | null>(null)
  /** Flow tip signature — follow-scroll only when this moves, never on a
   *  scroll-driven at-bottom chrome re-render (which would snap inertial
   *  scrolls the rest of the way to the floor). */
  const followSigRef = useRef<string | null>(null)

  const firstKey = order[0]
  const firstSeq = firstKey === undefined ? null : nodeStore.get(firstKey)?.anchorSeq ?? null
  const lastKey = order.at(-1) ?? null
  const lastNode = lastKey === null ? undefined : nodeStore.get(lastKey)
  const lastSteeringId = pendingSteering[pendingSteering.length - 1]?.id ?? null
  const lastSubmissionId = visibleSubmissions[visibleSubmissions.length - 1]?.requestId ?? null
  const followSig = `${openState}:${firstSeq}:${lastKey}:${order.length}:${running ? 1 : 0}:${lastSteeringId ?? ''}:${lastSubmissionId ?? ''}`

  const navigation = useChatNavigation({
    viewport, reading, railItems, firstSeq, hasMore, loadingOlder, loadOlder, loadThrough,
  })
  const { atBottom, atBottomRef, setAtBottom, activeTurn, setActiveTurn, scrollSamplePendingRef } = reading
  const { busyTurn, pendingJumpRef, navigateToTurn, loadEarlier, realizePendingJump, clearJump } = navigation

  const toBottom = (el: HTMLElement): void => {
    anchorRef.current = null
    readerAnchorRef.current = null
    // Returning to the live tail supersedes a jump still landing.
    clearJump()
    el.scrollTop = el.scrollHeight
    observedTopRef.current = el.scrollTop
    atBottomRef.current = true
    setAtBottom(true)
    chatScroll.save(null)
    setActiveTurn(turnNavigationItems.at(-1)?.turn ?? null)
  }
  toBottomRef.current = toBottom

  useLayoutEffect(() => {
    if (scrollSamplePendingRef.current) return
    const local = listRef.current
    /* v8 ignore next -- ref-null guard: React attaches the ref before layout effects run. */
    if (local === null) return
    const el = scrollerOf(local)
    // Open completed: jump to the bottom once — unless a scroll position
    // survives from a previous mount (view-tab switch away and back), which
    // is restored instead of snapping the reader back to the floor.
    if (openState === 'open' && !openedRef.current) {
      openedRef.current = true
      const saved = chatScroll.read()
      if (saved === null) {
        toBottom(el)
      } else {
        el.scrollTop = saved.scrollTop
        const row = anchorElement(local, saved.anchorKey)
        if (row !== null) el.scrollTop += flowTop(row, el) - saved.anchorTop
        observedTopRef.current = el.scrollTop
        const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD + 1
        atBottomRef.current = isAtBottom
        setAtBottom(isAtBottom)
        const normalized = isAtBottom ? null : scrollPosition(local, el)
        if (isAtBottom) chatScroll.save(null)
        else if (normalized !== null) chatScroll.save(normalized)
      }
      firstSeqRef.current = firstSeq
      lastKeyRef.current = lastKey
      lastSteeringIdRef.current = lastSteeringId
      lastSubmissionIdRef.current = lastSubmissionId
      followSigRef.current = followSig
      return
    }
    // Prepend (head seq decreased): preserve the same settled row at the
    // position established by the reader's latest scroll. This excludes
    // unrelated tail/composer growth while the request was in flight.
    if (anchorRef.current !== null && firstSeq !== null && firstSeqRef.current !== null && firstSeq < firstSeqRef.current) {
      const anchor = anchorRef.current
      anchorRef.current = null
      const row = anchorElement(local, anchor.key)
      if (row !== null) el.scrollTop += flowTop(row, el) - anchor.top
      observedTopRef.current = el.scrollTop
      // A jump chunk lands here: scroll to the target once its rows exist;
      // until then keep holding the reader's row for the next chunk.
      if (!realizePendingJump(local, el, false) && row !== null) {
        anchorRef.current = { key: anchor.key, top: flowTop(row, el) }
      }
      firstSeqRef.current = firstSeq
      /* v8 ignore next -- ?? arm: a prepend adds nodes, so the flow list here is never empty. */
      lastKeyRef.current = lastKey
      lastSteeringIdRef.current = lastSteeringId
      lastSubmissionIdRef.current = lastSubmissionId
      followSigRef.current = followSig
      return
    }
    firstSeqRef.current = firstSeq
    // Own words must be visible: a new trailing user node force-scrolls
    // (send lives in the composer, so arrival is detected here, not armed there).
    const appendedUser = lastKey !== lastKeyRef.current && lastNode?.kind === 'user'
    const appendedSteering = lastSteeringId !== null && lastSteeringId !== lastSteeringIdRef.current
    const appendedSubmission = lastSubmissionId !== null && lastSubmissionId !== lastSubmissionIdRef.current
    const tipMoved = followSigRef.current !== followSig
    lastKeyRef.current = lastKey
    lastSteeringIdRef.current = lastSteeringId
    lastSubmissionIdRef.current = lastSubmissionId
    followSigRef.current = followSig
    // Follow new flow content while pinned; do NOT re-pin on every render
    // merely because atBottomRef is true (scroll threshold → setState → snap).
    if (appendedUser || appendedSteering || appendedSubmission || (tipMoved && atBottomRef.current)) {
      toBottom(el)
      return
    }
    // A jump whose target committed outside the anchored-prepend path (for
    // example after a mid-jump toBottom dropped the held anchor) lands here.
    if (pendingJumpRef.current !== null) realizePendingJump(local, el, false)
  })

  return {
    listRef, columnRef, atBottom, activeTurn, busyTurn, navigateToTurn, loadEarlier, toBottom,
  }
}
