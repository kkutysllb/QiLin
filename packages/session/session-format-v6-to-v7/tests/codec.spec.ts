import { describe, expect, it } from 'vitest'
import { SessionFormatEventCollector } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatHeader, SessionFormatJsonObject } from '@qilin-agent/session-format'
import { releasedV6SessionFormatCodec } from '@qilin-agent/session-format-v5-to-v6'
import { releasedV7SessionFormatCodec } from '../src/index.ts'

const logicalHeader: SessionFormatHeader = {
  version: 7, id: 'v7-native', createdAt: 1, isSeeded: false, delegationDepth: 0,
}

function physical(value: SessionFormatHeader): SessionFormatJsonObject {
  return { type: 'session', ...value }
}

describe('released V7 codec framing', () => {
  it('decodes the released V7 physical header into the native logical header', () => {
    expect(releasedV7SessionFormatCodec.decodeHeader(physical({ ...logicalHeader, agentPreset: 'ptc' })))
      .toEqual({ ...logicalHeader, agentPreset: 'ptc' })
  })

  it('refuses headers outside the released V7 physical shape', () => {
    expect(() => releasedV7SessionFormatCodec.decodeHeader(physical({ ...logicalHeader, version: 6 })))
      .toThrow('expected format v7 physical header')
    expect(() => releasedV7SessionFormatCodec.decodeHeader(null)).toThrow('expected format v7 physical header')
  })

  it('decodes rows through the released V7 decoder and reports the V7 header', () => {
    const decoder = releasedV7SessionFormatCodec.createDecoder(physical(logicalHeader), 'strict')
    expect(decoder.header).toEqual(logicalHeader)
    const output = new SessionFormatEventCollector()
    const rows: SessionFormatEvent[] = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    for (const row of rows) decoder.decodeRow(releasedV7SessionFormatCodec.encodeEvent(row), output)
    expect(output.values).toEqual(rows)
    expect(decoder.finish(output)).toBe(0)
  })

  it('encodes the same physical rows as the released V6 codec', () => {
    const row: SessionFormatEvent = { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } }
    expect(releasedV7SessionFormatCodec.encodeEvent(row)).toEqual(releasedV6SessionFormatCodec.encodeEvent(row))
    expect(releasedV7SessionFormatCodec.encodeHeader(logicalHeader, 0))
      .toEqual({ ...releasedV6SessionFormatCodec.encodeHeader({ ...logicalHeader, version: 6 }, 0), version: 7 })
  })
})
