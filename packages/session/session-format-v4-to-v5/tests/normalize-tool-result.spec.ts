import { describe, expect, it } from 'vitest'
import type { SessionFormatArtifact, SessionFormatEvent } from '@qilin-agent/session-format'
import { releasedV5SessionFormatCodec } from '../src/codec.ts'
import { restoreReleasedV5Artifact } from '../src/validation.ts'

const header = { version: 5, id: 'session-1', createdAt: 1, isSeeded: false, delegationDepth: 0 } as const
const types = new Set(['turn/start', 'step/start', 'assistant/message', 'tool/call', 'tool/result'])

function event(value: Record<string, unknown>): SessionFormatEvent {
  return value as SessionFormatEvent
}

function artifact(toolCallId: string): SessionFormatArtifact {
  // relationships 用引用比较 arguments：assistant 与 tool/call 必须共用同一个对象。
  const args = {}
  const events: SessionFormatEvent[] = [
    event({ type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } }),
    event({ type: 'step/start', seq: 1, time: 2, data: { turn: 1, step: 1 } }),
    event({
      type: 'assistant/message', seq: 2, time: 3, surfaceOp: 'append',
      data: {
        turn: 1, step: 1,
        message: {
          id: 'assistant-1', role: 'assistant',
          source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-flash' },
          content: [{ type: 'tool-call', id: 'call-1', name: 'ktoon_shotlist_read', arguments: args }],
        },
      },
    }),
    event({ type: 'tool/call', seq: 3, time: 4, surfaceOp: 'append', data: { turn: 1, step: 1, callId: 'call-1', name: 'ktoon_shotlist_read', arguments: args } }),
    event({
      type: 'tool/result', seq: 4, time: 5, surfaceOp: 'append', sourceEventSeqs: [3],
      data: {
        turn: 1, step: 1,
        message: {
          id: 'tool-result-1', role: 'tool', toolCallId,
          source: { kind: 'tool', callId: 'call-1', name: 'ktoon_shotlist_read' },
          content: [],
        },
      },
    }),
  ]
  return { header, inheritedEventCount: 0, events }
}

describe('V5 tool/result call-id normalization', () => {
  it('normalizes before encoding', () => {
    const row = releasedV5SessionFormatCodec.encodeEvent(
      event({ type: 'tool/result', seq: 0, time: 1, surfaceOp: 'append', data: { message: { id: 'm', role: 'tool', toolCallId: 'call-stale', source: { kind: 'tool', callId: 'call-1' }, content: [] } } }),
    )
    expect((row.data as { message: { toolCallId: string } }).message.toolCallId).toBe('call-1')
  })

  it('repairs a detached artifact on restore and keeps a clean artifact identical', () => {
    const repaired = restoreReleasedV5Artifact(artifact('call-stale'), types)
    expect((repaired.events[4]?.data as { message: { toolCallId: string } }).message.toolCallId).toBe('call-1')
    const clean = artifact('call-1')
    expect(restoreReleasedV5Artifact(clean, types)).toBe(clean)
  })
})
