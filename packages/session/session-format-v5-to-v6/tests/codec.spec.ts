import { describe, expect, it } from 'vitest'
import { SessionFormatEventCollector } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatHeader, SessionFormatJsonObject } from '@qilin-agent/session-format'
import { releasedV5SessionFormatCodec } from '@qilin-agent/session-format-v4-to-v5'
import { releasedV6SessionFormatCodec } from '../src/index.ts'

const logicalHeader: SessionFormatHeader = {
  version: 6, id: 'v6-native', createdAt: 1, isSeeded: false, delegationDepth: 0,
}

function physical(value: SessionFormatHeader): SessionFormatJsonObject {
  return { type: 'session', ...value }
}

describe('released V6 codec framing', () => {
  it('decodes the released V6 physical header into the native logical header', () => {
    expect(releasedV6SessionFormatCodec.decodeHeader(physical({ ...logicalHeader, agentPreset: 'ptc' })))
      .toEqual({ ...logicalHeader, agentPreset: 'ptc' })
  })

  it('refuses headers outside the released V6 physical shape', () => {
    expect(() => releasedV6SessionFormatCodec.decodeHeader(physical({ ...logicalHeader, version: 5 })))
      .toThrow('expected format v6 physical header')
    expect(() => releasedV6SessionFormatCodec.decodeHeader(null)).toThrow('expected format v6 physical header')
  })

  it('decodes rows through the released V6 decoder and reports the V6 header', () => {
    const decoder = releasedV6SessionFormatCodec.createDecoder(physical(logicalHeader), 'strict')
    expect(decoder.header).toEqual(logicalHeader)
    const output = new SessionFormatEventCollector()
    const rows: SessionFormatEvent[] = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    for (const row of rows) decoder.decodeRow(releasedV6SessionFormatCodec.encodeEvent(row), output)
    expect(output.values).toEqual(rows)
    expect(decoder.finish(output)).toBe(0)
  })

  it('encodes the same physical rows as the released V5 codec', () => {
    const row: SessionFormatEvent = { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } }
    expect(releasedV6SessionFormatCodec.encodeEvent(row)).toEqual(releasedV5SessionFormatCodec.encodeEvent(row))
    expect(releasedV6SessionFormatCodec.encodeHeader(logicalHeader, 0))
      .toEqual({ ...releasedV5SessionFormatCodec.encodeHeader({ ...logicalHeader, version: 5 }, 0), version: 6 })
  })
})
