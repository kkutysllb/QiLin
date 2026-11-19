import { describe, expect, it } from 'vitest'
import type { SessionFormatEvent } from '@qilin-agent/session-format'
import { releasedV4SessionFormatCodec } from '../src/index.ts'
import { assertV4ToolResultMessage, normalizeV4ToolResultCallIds } from '../src/tool-role.ts'

function resultEvent(options: { toolCallId?: string; callId?: string; name?: string } = {}): SessionFormatEvent {
  return {
    type: 'tool/result',
    seq: 0,
    time: 1,
    data: {
      turn: 3,
      step: 2,
      message: {
        id: 'message-1',
        role: 'tool',
        toolCallId: options.toolCallId ?? 'call-1',
        source: { kind: 'tool', callId: options.callId ?? 'call-1', name: options.name ?? 'ktoon_song_read' },
        content: [],
      },
    },
  } as SessionFormatEvent
}

describe('tool/result call-id normalization', () => {
  it('leaves a consistent row untouched and returns the same object', () => {
    const event = resultEvent()
    expect(normalizeV4ToolResultCallIds(event)).toBe(event)
  })

  it('adopts source.callId when the message carries a stale toolCallId', () => {
    const event = resultEvent({ toolCallId: 'call-stale' })
    const normalized = normalizeV4ToolResultCallIds(event)
    expect(normalized).not.toBe(event)
    expect((normalized.data as { message: { toolCallId: string } }).message.toolCallId).toBe('call-1')
    expect((event.data as { message: { toolCallId: string } }).message.toolCallId).toBe('call-stale')
    expect(() => { assertV4ToolResultMessage(normalized) }).not.toThrow()
  })

  it('normalizes at encode time so the row still persists', () => {
    const row = releasedV4SessionFormatCodec.encodeEvent(resultEvent({ toolCallId: 'call-stale' }))
    expect((row.data as { message: { toolCallId: string } }).message.toolCallId).toBe('call-1')
  })

  it('leaves rows without a usable source.callId for admission to reject', () => {
    for (const event of [
      resultEvent({ callId: '' }),
      { ...resultEvent(), type: 'feedback/record' },
      { type: 'tool/result', seq: 0, time: 1, data: {} },
      { type: 'tool/result', seq: 0, time: 1, data: { message: {} } },
      { type: 'tool/result', seq: 0, time: 1, data: { message: { source: {} } } },
      null,
      'row',
    ]) {
      expect(normalizeV4ToolResultCallIds(event)).toBe(event)
    }
  })

  it('never rewrites a fork not-started result (its id encodes identity)', () => {
    const event = resultEvent({ toolCallId: 'call-stale' })
    const data = event.data as { error?: unknown; message: { id: string } }
    data.error = { name: 'ToolNotStartedError', code: 'TOOL_NOT_STARTED' }
    data.message.id = 'forked-tool-result-call-1-0'
    expect(normalizeV4ToolResultCallIds(event)).toBe(event)
  })

  it('reports the tool name, both ids and turn/step when admission still fails', () => {
    expect(() => { assertV4ToolResultMessage(resultEvent({ toolCallId: 'call-stale' })) })
      .toThrow(/tool=ktoon_song_read.*toolCallId="call-stale".*source\.callId="call-1".*turn=3, step=2/)
    const anonymous = resultEvent({ toolCallId: 'call-stale', name: '' })
    expect(() => { assertV4ToolResultMessage(anonymous) }).toThrow(/tool=unknown/)
    const unframed = resultEvent({ toolCallId: 'call-stale' })
    delete (unframed.data as { turn?: number }).turn
    delete (unframed.data as { step?: number }).step
    expect(() => { assertV4ToolResultMessage(unframed) }).toThrow(/turn=\?, step=\?/)
  })
})
