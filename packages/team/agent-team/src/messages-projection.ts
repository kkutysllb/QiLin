/**
 * The `agentMessages` projection unit: the inbound peer messages one Session
 * received from another Agent, newest last and capped, so a fleet view can row
 * cross-Agent traffic without reading every Session log.
 *
 * Both durable paths land in the recipient's own log as `user/message` entries:
 * a Team mailbox delivery carries the `team-message` source with the mailbox
 * identity and sender name, and an adjacent-Agent `send_message` carries the
 * `agent-message` source with the sender's Session id. Folding the recipient's
 * log therefore yields one complete inbound row per message, and the client
 * merges the agents it draws.
 *
 * @module @qilin-agent/agent-team/messages-projection
 */

import { z } from 'zod'
import type { ZodType } from 'zod'
import { brandString } from '@qilin-agent/brand'
import type { SessionId } from '@qilin-agent/session/types'
import type { SessionEvent } from '@qilin-agent/session'
import type { ProjectionDefinition } from '@qilin-agent/session-projection'
import type {} from '@qilin-agent/subagent'
import type { AgentMessageRecord, AgentMessagesState } from './types.ts'

/** Rows one Session keeps: enough for a timeline, small enough for every summary. */
export const AGENT_MESSAGE_LIMIT = 12
/** Preview budget: the timeline row wraps at two lines. */
export const AGENT_MESSAGE_PREVIEW_LIMIT = 160

const EMPTY_MESSAGES: AgentMessagesState = { messages: [] }

const sessionIdSchema = z.string().min(1).max(200).transform(value => brandString<SessionId>(value))

const agentMessageRecordSchema = z.object({
  id: z.string().min(1).max(160),
  time: z.number().int().nonnegative(),
  kind: z.enum(['agent-message', 'team-message']),
  senderId: sessionIdSchema,
  senderName: z.string().min(1).max(200).optional(),
  text: z.string().max(AGENT_MESSAGE_PREVIEW_LIMIT),
}).strict() as ZodType<AgentMessageRecord>

const agentMessagesSchema = z.object({
  messages: z.array(agentMessageRecordSchema).max(AGENT_MESSAGE_LIMIT),
}).strict() as ZodType<AgentMessagesState>

type UserContent = SessionEvent<'user/message'>['data']['content']

/**
 * Space-join the text blocks, collapse whitespace, and cap with a trailing
 * ellipsis when clipped. Each block is read to twice the budget at most, so one
 * oversized block never concatenates whole.
 */
function preview(content: UserContent): string {
  const text = content
    .map(block => block.type === 'text' ? block.text.slice(0, AGENT_MESSAGE_PREVIEW_LIMIT * 2) : '')
    .join(' ')
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > AGENT_MESSAGE_PREVIEW_LIMIT - 1
    ? `${normalized.slice(0, AGENT_MESSAGE_PREVIEW_LIMIT - 1).trimEnd()}…`
    : normalized
}

/** Drop the durable "Agent <id> sent a message:" lead-in the relay path prepends. */
function stripRelayPrefix(text: string, senderId: string): string {
  const prefix = `Agent ${senderId} sent a message: `
  return text.startsWith(prefix) ? text.slice(prefix.length) : text
}

/** Append one row, keeping the newest rows when the cap is reached. */
function appended(state: AgentMessagesState, record: AgentMessageRecord): AgentMessagesState {
  const messages = [...state.messages, record]
  return {
    messages: messages.length > AGENT_MESSAGE_LIMIT
      ? messages.slice(messages.length - AGENT_MESSAGE_LIMIT)
      : messages,
  }
}

/** The `agentMessages` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
export const agentMessagesProjectionDefinition = {
  key: 'agentMessages',
  stateVersion: 1,
  stateSchema: agentMessagesSchema,
  init: () => EMPTY_MESSAGES,
  apply: (state, event) => {
    if (event.type !== 'user/message') return state
    const source = event.data.source
    if (source.kind === 'team-message') {
      return appended(state, {
        id: String(source.messageId),
        time: event.time,
        kind: 'team-message',
        senderId: source.senderId,
        senderName: source.senderName,
        text: preview(event.data.content),
      })
    }
    if (source.kind === 'agent-message') {
      const senderId = String(source.senderSessionId)
      return appended(state, {
        id: `seq:${String(event.seq)}`,
        time: event.time,
        kind: 'agent-message',
        senderId: source.senderSessionId,
        text: stripRelayPrefix(preview(event.data.content), senderId),
      })
    }
    return state
  },
  wire: {
    viewSchema: agentMessagesSchema,
    view: state => state,
  },
} satisfies ProjectionDefinition<'agentMessages', AgentMessagesState>
