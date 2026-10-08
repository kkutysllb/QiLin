/**
 * Pure sidechat view model: the follow address of one thread, and the fold
 * from durable Session events to the panel's transcript entries.
 */
import type { SessionId } from '@qilin-agent/session'
import type { SessionFollowFrame, SessionHistoryRecord } from '@qilin-agent/api-session-controller/types'

/** One rendered line of a thread's transcript. */
export interface SidechatTranscriptEntry {
  readonly seq: number
  readonly kind: 'user' | 'boundary' | 'assistant'
  readonly text: string
}

/**
 * The subagent history address of one sidechat thread: every thread is a
 * `continuable` child of its parent Session.
 * @param parentSessionId - the parent Session the panel is open on.
 * @param childSessionId - the sidechat thread.
 * @returns the follow address.
 */
export function sidechatAddress(parentSessionId: SessionId, childSessionId: SessionId): {
  kind: 'subagent'
  parentSessionId: SessionId
  childSessionId: SessionId
  mode: 'continuable'
} {
  return { kind: 'subagent', parentSessionId, childSessionId, mode: 'continuable' }
}

/** One message content part: the wire fields this panel reads, or a hole in the array. */
type ContentPart = { type?: string; text?: unknown } | undefined

/** Whether one message data value carries the content-part array. */
function hasContentParts(value: unknown): value is readonly ContentPart[] {
  return Array.isArray(value)
}

/** The joined text of one message event's data, or `undefined` when it carries none. */
function messageText(data: unknown): string | undefined {
  const content = (data as { content?: unknown }).content
  if (!hasContentParts(content)) return undefined
  const parts: string[] = []
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') parts.push(part.text)
  }
  const text = parts.join('')
  return text.length > 0 ? text : undefined
}

/**
 * Fold one durable history record into a transcript entry, or `undefined`
 * for events the panel does not draw.
 * @param record - one journal record.
 * @returns the entry, when the event is a user, boundary, or assistant message.
 */
export function transcriptEntryOf(record: SessionHistoryRecord): SidechatTranscriptEntry | undefined {
  const event = record.event
  const text = messageText(event.data)
  if (text === undefined) return undefined
  if (event.type === 'user/message') {
    const sourceKind = (event.data as { source?: { kind?: string } }).source?.kind
    return { seq: event.seq, kind: sourceKind === 'sidechat-boundary' ? 'boundary' : 'user', text }
  }
  if (event.type === 'assistant/message') return { seq: event.seq, kind: 'assistant', text }
  return undefined
}

/**
 * Fold one follow frame into transcript entries: the opening snapshot replays
 * whole records, committed frames arrive one event at a time, and the
 * process-local assistant stream is ignored (durable events own the transcript).
 * @param frame - one frame from the thread's follow stream.
 * @returns the entries the frame contributes, oldest first.
 */
export function transcriptEntriesOfFrame(frame: SessionFollowFrame): readonly SidechatTranscriptEntry[] {
  if (frame.type === 'snapshot') {
    return frame.records.map(transcriptEntryOf).filter(entry => entry !== undefined)
  }
  if (frame.type === 'event') {
    const entry = transcriptEntryOf(frame)
    return entry === undefined ? [] : [entry]
  }
  return []
}
