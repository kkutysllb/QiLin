/**
 * The `agentMessages` projection unit: inbound peer messages folded from one
 * Session's own log — Team mailbox deliveries and adjacent-Agent messages —
 * with bounded previews, a newest-last cap, and a restore schema that refuses
 * an oversized row.
 */
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@qilin-agent/session'
import { SessionId, SessionSeq } from '@qilin-agent/session'
import {
  AGENT_MESSAGE_LIMIT,
  AGENT_MESSAGE_PREVIEW_LIMIT,
  agentMessagesProjectionDefinition,
} from '../src/messages-projection.ts'
import { TeamId, TeamMessageId } from '../src/types.ts'
import type { AgentMessageRecord, AgentMessagesState } from '../src/types.ts'

const SENDER = SessionId('sender')
const TARGET = SessionId('target')
const TEAM = TeamId('team-root')

/** One fabricated user-message envelope carrying the given source. */
function message(seq: number, time: number, source: unknown, text: string): SessionEvent<'user/message'> {
  return {
    type: 'user/message',
    seq: SessionSeq(seq),
    time,
    data: {
      content: [{ type: 'text', text }],
      source,
    },
  } as unknown as SessionEvent<'user/message'>
}

function teamSource(messageId: string): unknown {
  return { kind: 'team-message', teamId: TEAM, messageId: TeamMessageId(messageId), senderId: SENDER, senderName: 'lead' }
}

function fold(events: readonly SessionEvent[]): AgentMessagesState {
  let state = agentMessagesProjectionDefinition.init()
  for (const event of events) state = agentMessagesProjectionDefinition.apply(state, event)
  return state
}

describe('agentMessages projection unit', () => {
  it('folds a Team mailbox delivery with its durable identity and preview', () => {
    const state = fold([message(3, 1_000, teamSource('m1'), 'please review the draft')])
    expect(state.messages).toEqual([
      { id: TeamMessageId('m1'), time: 1_000, kind: 'team-message', senderId: SENDER, senderName: 'lead', text: 'please review the draft' },
    ])
    expect(agentMessagesProjectionDefinition.wire?.view(state)).toEqual(state)
  })

  it('folds an adjacent-Agent message and drops the relay lead-in', () => {
    const state = fold([message(4, 2_000, { kind: 'agent-message', form: 'relay', senderSessionId: SENDER }, `Agent ${SENDER} sent a message: build the tests`)])
    expect(state.messages[0]).toEqual({
      id: 'seq:4',
      time: 2_000,
      kind: 'agent-message',
      senderId: SENDER,
      text: 'build the tests',
    })
  })

  it('keeps a relay text whose lead-in was rewritten', () => {
    const state = fold([message(5, 3_000, { kind: 'agent-message', form: 'relay', senderSessionId: SENDER }, 'no lead-in here')])
    expect(state.messages[0]?.text).toBe('no lead-in here')
  })

  it('ignores every other source and every other event', () => {
    const other = message(6, 4_000, { kind: 'user' }, 'human prompt')
    expect(fold([other]).messages).toEqual([])
    const boundary = {
      type: 'turn/start', seq: SessionSeq(7), time: 5_000, data: { turn: 1 },
    } as unknown as SessionEvent
    expect(fold([other, boundary]).messages).toEqual([])
    expect(agentMessagesProjectionDefinition.apply({ messages: [] }, boundary)).toEqual({ messages: [] })
  })

  it('skips non-text blocks and collapses a whitespace-only message', () => {
    const withImage = {
      type: 'user/message',
      seq: SessionSeq(10),
      time: 10,
      data: {
        content: [
          { type: 'image', mediaType: 'image/png', data: 'AAAA', width: 1, height: 1 },
          { type: 'text', text: 'after the image' },
        ],
        source: teamSource('m-image'),
      },
    } as unknown as SessionEvent<'user/message'>
    expect(fold([withImage]).messages[0]?.text).toBe('after the image')
    const blank = fold([message(11, 11, teamSource('m-blank'), '   \n  ')])
    expect(blank.messages[0]?.text).toBe('')
  })

  it('bounds the preview and reports a clipped remainder', () => {
    const long = 'x'.repeat(AGENT_MESSAGE_PREVIEW_LIMIT * 3)
    const short = fold([message(8, 6_000, { kind: 'team-message', teamId: TEAM, messageId: TeamMessageId('m2'), senderId: SENDER, senderName: 'lead' }, long)])
    expect(short.messages[0]?.text).toHaveLength(AGENT_MESSAGE_PREVIEW_LIMIT)
    expect(short.messages[0]?.text.endsWith('…')).toBe(true)
    const spaced = fold([message(9, 7_000, { kind: 'team-message', teamId: TEAM, messageId: TeamMessageId('m3'), senderId: SENDER, senderName: 'lead' }, '  spaced \n text  ')])
    expect(spaced.messages[0]?.text).toBe('spaced text')
  })

  it('keeps only the newest rows at the cap', () => {
    const events = Array.from({ length: AGENT_MESSAGE_LIMIT + 3 }, (_, index) => message(
      index + 1, index + 1, teamSource(`m${String(index)}`), `row ${String(index)}`,
    ))
    const state = fold(events)
    expect(state.messages).toHaveLength(AGENT_MESSAGE_LIMIT)
    expect(state.messages[0]?.text).toBe('row 3')
    expect(state.messages.at(-1)?.text).toBe(`row ${String(AGENT_MESSAGE_LIMIT + 2)}`)
  })

  it('validates a restored state and refuses an oversized row', () => {
    const state: AgentMessagesState = { messages: [] }
    expect(agentMessagesProjectionDefinition.stateSchema.parse(state)).toEqual(state)
    const oversized: AgentMessageRecord = {
      id: 'm1', time: 0, kind: 'team-message', senderId: TARGET, text: 'x'.repeat(AGENT_MESSAGE_PREVIEW_LIMIT + 1),
    }
    expect(() => agentMessagesProjectionDefinition.stateSchema.parse({ messages: [oversized] })).toThrow()
    expect(() => agentMessagesProjectionDefinition.stateSchema.parse({ messages: [], extra: 1 })).toThrow()
  })
})
