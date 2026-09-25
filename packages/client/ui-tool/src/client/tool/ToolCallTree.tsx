/** Root/subcall Tool composition with one keyed atomic dispatch path. */
import { memo, useMemo, type ReactNode } from 'react'
import type { ToolCallBlock } from '@qilin/client-ui-chat/client'
import type { ToolCallHookContext, ToolCallOwnerProps, ToolCallPhaseProps, ToolTreeProps } from '../contract/slots.ts'
import type { ToolCallDetail } from '@qilin/client-ui-chat/client'
import { toolRowModel } from './models/tool-call-model.ts'
import { GenericToolCard } from './toolviews/GenericToolCard.tsx'
import css from './ToolCallTree.module.css'

function toolCallPhase(block: ToolCallBlock): ToolCallPhaseProps {
  if ('kind' in block) return { phase: 'result', block }
  return block.phase === 'preparing' ? { phase: 'preparing', block } : { phase: 'start', block }
}

/** Resolve a Tool call's wire name from its current stage. */
function callName(call: ToolCallPhaseProps): string {
  return call.phase === 'result' ? call.block.call?.name ?? '' : call.block.name
}

/** One atomic call dispatched through the Tool-owned keyed slot. */
const ToolCall = memo(function ToolCall({
  renderSlot, callId, toolName, call, assistant, openFile, cwd, home, inspectCall, loadImage, detail, t, children,
}: Pick<ToolTreeProps, 'renderSlot' | 'openFile' | 'cwd' | 'inspectCall' | 'loadImage' | 't'> & {
  callId: string
  toolName: string
  call: ToolCallPhaseProps
  assistant: ToolCallHookContext['assistant']
  home?: string | undefined
  /** Resolved work-details presentation for the dispatched rows. */
  detail: ToolCallDetail
  children?: ReactNode
}) {
  const preparing = call.phase === 'preparing'
  const hookContext = useMemo<ToolCallHookContext>(() => ({
    callId, assistant: preparing ? assistant : undefined,
  }), [assistant, callId, preparing])
  const owner: ToolCallOwnerProps = useMemo(() => ({
    callId,
    toolName,
    ...call,
    openFile,
    cwd,
    home,
    loadImage,
    inspect: () => { inspectCall(callId) },
    detail,
  }), [callId, toolName, call, openFile, cwd, home, loadImage, inspectCall, detail])
  const autoReviewDenied = useMemo(
    () => call.phase === 'result' && toolRowModel(toolName, call.block).autoReviewDenial !== null,
    [toolName, call],
  )
  return (
    <div
      className={css.callRow}
      data-chat-anchor-key={`call:${callId}`}
      data-chat-call-id={callId}
    >
      {autoReviewDenied
        ? <GenericToolCard {...owner} t={t} />
        : renderSlot('tool.call.toolview', owner, {
          entryKey: toolName,
          hookContext,
          fallback: <GenericToolCard {...owner} t={t} />,
        })}
      {children}
    </div>
  )
})

const ToolCallBranch = memo(function ToolCallBranch({
  renderSlot, block, assistant, cwd, home, openFile, inspectCall, loadImage, detail, t,
}: Pick<ToolTreeProps, 'renderSlot' | 'cwd' | 'openFile' | 'inspectCall' | 'loadImage' | 't'> & {
  block: ToolCallBlock
  assistant: ToolCallHookContext['assistant']
  home?: string | undefined
  /** Resolved work-details presentation for the dispatched rows. */
  detail: ToolCallDetail
}) {
  const call = useMemo(() => toolCallPhase(block), [block])
  return (
    <ToolCall
      renderSlot={renderSlot}
      callId={call.block.callId}
      toolName={callName(call)}
      call={call}
      assistant={assistant}
      openFile={openFile}
      cwd={cwd}
      home={home}
      inspectCall={inspectCall}
      loadImage={loadImage}
      detail={detail}
      t={t}
    >
      {call.phase !== 'preparing' && call.block.subCalls.length > 0 ? (
        <div className={css.subCalls} data-subcalls>
          {call.block.subCalls.map(child => (
            <ToolCallBranch
              key={child.callId}
              renderSlot={renderSlot}
              block={child}
              assistant={assistant}
              cwd={cwd}
              home={home}
              openFile={openFile}
              inspectCall={inspectCall}
              loadImage={loadImage}
              detail={detail}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </ToolCall>
  )
})

/**
 * Render one root Tool call and its recursive children through the same
 * atomic keyed dispatch.
 * @param props - whole-Tool owner data and the Tool-owned child-slot share.
 * @returns the Tool call tree.
 */
export function ToolCallTree({
  renderSlot, node, cwd, openFile, inspectCall, loadImage, toolDetail, useHostInfo, t,
}: ToolTreeProps) {
  const home = useHostInfo(info => info.home)
  const assistant = node.location.kind === 'step' ? node.location.step.data.source('assistant-step') : undefined
  // Detached renderers without a mode read as the Standard presentation.
  const detail = toolDetail ?? 'collapsed'
  return (
    <ToolCallBranch
      renderSlot={renderSlot}
      block={node.data.root}
      assistant={assistant}
      cwd={cwd}
      home={home}
      openFile={openFile}
      inspectCall={inspectCall}
      loadImage={loadImage}
      detail={detail}
      t={t}
    />
  )
}
