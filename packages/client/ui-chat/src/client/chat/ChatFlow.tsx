/** Ordered Chat rows, local echoes, and running status share the flow slot's parent. */
import { memo, useCallback, useEffect, useRef } from 'react'
import type { RenderMessageImages } from '@qilin-agent/client-ui-conversation/client'
import { assertNever } from '@qilin-agent/util-values'
import type { ChatFlowSlotProps } from '../contract/slots.ts'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import { ChatGroupSeat } from './ChatGroupSeat.tsx'
import { PendingSteeringBubble, PendingSubmissionBubble } from './MessageItem.tsx'
import { chatRenderKey } from './render-entry.ts'
import { RunningStatus } from './RunningStatus.tsx'

/** Render the flow without adding a DOM parent or changing keyed row positions. */
export const ChatFlow = memo(function ChatFlow({
  entries, pendingInputs, lastInputTurn, deferCollapse,
  useSession, useChat, useChatNode, useChatNodeBottom, useChatNodeProcess, useChatGroup, usePresentation,
  useStore, actions, renderSlot, t, useGroupAction, useGroupHeaderAction,
  cwd, openFile, openSkill, inspectCall, forkAt, editUserMessage, retryTurn, continueGeneration, retryQueuedTurn,
  loadImage,
}: ChatFlowSlotProps) {
  const nodeStore = useChat(snapshot => snapshot.nodes)
  const running = useSession(snapshot => snapshot.running)
  // The running clock anchors on the timeline's latest open Turn — the same
  // fact the settled Turn-process header reads. Node Locations are no anchor:
  // session-scoped rows carry none, and the latest Node's Location can stay
  // unresolved while the Turn is running. A Turn whose start fell outside the
  // loaded window falls back to its earliest loaded step start.
  const runningStartTime = useChat((snapshot) => {
    const latest = snapshot.timeline.turnOrder.at(-1)
    const turn = latest === undefined ? undefined : snapshot.timeline.turns.get(latest)
    if (turn === undefined || turn.status !== 'open') return undefined
    return turn.start?.time ?? turn.steps.find(step => step.start !== undefined)?.start?.time
  })
  // The completion regroup replaces member subtrees without re-rendering every
  // owning seat, dropping the focused control to the document body. This flow
  // outlives that regroup: while a record names the focused member of a closed
  // Turn, an observer retries the restoration after each DOM change until the
  // recorded row takes focus. The reader focusing anything else consumes the
  // record and stops this.
  const focusRecordKey = useStore((state) => {
    const entry = [...state.turnProcesses].reverse().find(item => item.focusedNode !== undefined)
    return entry === undefined ? undefined : `${entry.turn}:${entry.focusedNode}`
  })
  const focusedNode = focusRecordKey === undefined ? undefined : focusRecordKey.slice(focusRecordKey.indexOf(':') + 1)
  const recordTurnKey = focusRecordKey === undefined ? undefined : Number(focusRecordKey.slice(0, focusRecordKey.indexOf(':')))
  // The timeline's Turn status is the closed signal that survives full
  // settlement: a node's process presentation can detach once the answer
  // settles, which would disarm the observer mid-restoration.
  const recordTurnClosed = useChat(snapshot => recordTurnKey === undefined
    ? false : snapshot.timeline.turns.get(recordTurnKey)?.status === 'closed')
  const restoreObserverRef = useRef<MutationObserver | null>(null)
  useEffect(() => {
    if (focusRecordKey === undefined || !recordTurnClosed) {
      restoreObserverRef.current?.disconnect()
      restoreObserverRef.current = null
      return
    }
    const recordTurn = Number(focusRecordKey.slice(0, focusRecordKey.indexOf(':')))
    // Same-key wrappers can coexist while the regroup swaps a row between
    // groupings, so every wrapper carrying the recorded key takes part.
    const recordedRows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[data-chat-node-key]')]
      .filter(element => element.dataset.chatNodeKey === focusedNode)
    const attempt = (): void => {
      const active = document.activeElement
      const rows = recordedRows()
      if (active !== null && active !== document.body) {
        // Focus still standing inside a recorded row keeps the record for the
        // regroup that follows; anywhere else is the reader moving on.
        if (!rows.some(row => row.contains(active))) actions.consumeTurnProcessFocus(recordTurn)
        return
      }
      // Row controls include role=button elements, not just <button>.
      for (const control of rows.flatMap(row => [...row.querySelectorAll<HTMLElement>('button:not([disabled]), [role="button"]:not([disabled]):not([aria-disabled="true"])')])) {
        // Collapsed content hides its own buttons, and a hidden button
        // silently refuses focus; walk until one actually takes it.
        control.focus()
        if (document.activeElement === control) {
          actions.consumeTurnProcessFocus(recordTurn)
          return
        }
      }
    }
    // A reader focusing another control moves on in that instant. Waiting for the
    // next DOM change would read that control's own removal as a dropped regroup
    // and hand focus back to the recorded row, scrolling the transcript away.
    const consumeOutside = (event: FocusEvent): void => {
      const target = event.target
      if (!(target instanceof Node) || recordedRows().some(row => row.contains(target))) return
      actions.consumeTurnProcessFocus(recordTurn)
    }
    attempt()
    document.addEventListener('focusin', consumeOutside, true)
    const observer = new MutationObserver(() => { attempt() })
    observer.observe(document.body, { childList: true, subtree: true })
    restoreObserverRef.current = observer
    return () => {
      document.removeEventListener('focusin', consumeOutside, true)
      observer.disconnect()
    }
  }, [focusRecordKey, focusedNode, recordTurnClosed, actions])

  const renderMessageImages = useCallback<RenderMessageImages>(
    owner => renderSlot('conversation.message.images', { ...owner, loadImage }),
    [loadImage, renderSlot],
  )
  const seatProps = {
    nodeStore, useChatNode, useChatNodeBottom, useChatNodeProcess, usePresentation,
    useStore, actions, renderSlot, t, useGroupAction, deferCollapse,
    cwd, openFile, openSkill, inspectCall, forkAt, editUserMessage, retryTurn, continueGeneration,
    retryQueuedTurn, loadImage, renderMessageImages,
  }
  const rows = entries.map((entry) => {
    switch (entry.kind) {
      case 'node':
        return <ChatNodeSeat {...seatProps} key={chatRenderKey(entry)} nodeKey={entry.key}
          {...entry.groupPart === undefined ? {} : { groupPart: entry.groupPart }} />
      case 'group':
        return <ChatGroupSeat {...seatProps} key={chatRenderKey(entry)} groupKey={entry.key}
          useChatGroup={useChatGroup} useGroupHeaderAction={useGroupHeaderAction} />
      default:
        return assertNever(entry)
    }
  })
  const pendingRows = pendingInputs.map(item => 'requestId' in item ? (
    <PendingSubmissionBubble key={item.requestId} submission={item}
      renderMessageImages={renderMessageImages} t={t} />
  ) : (
    <PendingSteeringBubble key={item.id} content={item.content}
      renderMessageImages={renderMessageImages} t={t} />
  ))
  const tail = entries.at(-1)
  const node = tail?.kind === 'node' ? nodeStore.get(tail.key) : undefined
  // An empty opening control follows one local transcript echo, never steering.
  // All rows share this keyed list so inserting the control keeps the echo mounted.
  if (node?.kind === 'turn-process' && node.location.kind === 'turn'
    && node.location.turn.status === 'open' && node.location.turn.turn !== lastInputTurn) {
    const index = pendingInputs.findIndex(item => 'requestId' in item && item.placement === 'transcript')
    if (index !== -1) rows.splice(rows.length - 1, 0, ...pendingRows.splice(index, 1))
  }
  return [...rows, ...pendingRows, ...running ? [<RunningStatus key="running" startTime={runningStartTime} t={t} />] : []]
})
