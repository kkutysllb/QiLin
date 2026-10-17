import { describe, expect, it } from 'vitest'
import { SessionFormatEventCollector } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatHeader, SessionFormatJsonObject } from '@qilin-agent/session-format'
import { releasedV4SessionFormatCodec } from '@qilin-agent/session-format-v3-to-v4'
import { releasedV5SessionFormatCodec } from '../src/index.ts'

const logicalHeader: SessionFormatHeader = {
  version: 5, id: 'v5-native', createdAt: 1, isSeeded: false, delegationDepth: 0,
}

function physical(value: SessionFormatHeader): SessionFormatJsonObject {
  return { type: 'session', ...value }
}

const developer = {
  id: 'developer-1',
  role: 'developer',
  source: { kind: 'tool-registry' },
  content: [{ type: 'tool-addition', toolName: 'search' }],
}

describe('released V5 codec framing', () => {
  it('decodes the released V5 physical header into the native logical header', () => {
    expect(releasedV5SessionFormatCodec.decodeHeader(physical({ ...logicalHeader, agentPreset: 'ptc' })))
      .toEqual({ ...logicalHeader, agentPreset: 'ptc' })
  })

  it('refuses headers outside the released V5 physical shape', () => {
    expect(() => releasedV5SessionFormatCodec.decodeHeader(physical({ ...logicalHeader, version: 4 })))
      .toThrow('expected format v5 physical header')
    expect(() => releasedV5SessionFormatCodec.decodeHeader(null)).toThrow('expected format v5 physical header')
  })

  it('decodes rows through the released V5 decoder and reports the V5 header', () => {
    const decoder = releasedV5SessionFormatCodec.createDecoder(physical(logicalHeader), 'strict')
    expect(decoder.header).toEqual(logicalHeader)
    const output = new SessionFormatEventCollector()
    const rows: SessionFormatEvent[] = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    for (const row of rows) decoder.decodeRow(releasedV5SessionFormatCodec.encodeEvent(row), output)
    expect(output.values).toEqual(rows)
    expect(decoder.finish(output)).toBe(0)
  })

  it('admits ignorable developer messages through V5 native validation', () => {
    const row = {
      type: 'developer/message', seq: 3, time: 4, ignorable: true,
      data: { turn: 1, step: 1, headerSeq: 2, message: developer },
    } as SessionFormatEvent
    expect(releasedV5SessionFormatCodec.encodeEvent(row))
      .toEqual(releasedV4SessionFormatCodec.encodeEvent(row))
  })

  it('refuses a malformed ignorable developer message before framing', () => {
    const row = {
      type: 'developer/message', seq: 3, time: 4, ignorable: true,
      data: { turn: 1, step: 1, headerSeq: 2, message: { ...developer, content: [{ type: 'tool-addition' }] } },
    } as unknown as SessionFormatEvent
    expect(() => releasedV5SessionFormatCodec.encodeEvent(row)).toThrow('nonempty toolName')
  })
})
