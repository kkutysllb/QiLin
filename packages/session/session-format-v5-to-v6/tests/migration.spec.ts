import { describe, expect, it } from 'vitest'
import { SessionFormatEventCollector } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatEventRun, SessionFormatHeader } from '@qilin-agent/session-format'
import { SESSION_FORMAT_VERSION } from '@qilin-agent/session'
import { sessionFormatCatalog } from '@qilin-agent/session-format-catalog'
import { releasedV5SessionFormatCodec, sessionFormatV5ToV6 } from '../src/index.ts'

const header: SessionFormatHeader = { version: 5, id: 'identity', createdAt: 1, isSeeded: false, delegationDepth: 0 }
const fact: SessionFormatEvent = { type: 'feedback/record', seq: 0, time: 2, data: { text: 'retained' } }

function stage(sourceHeader = header, sourceInheritedEventCount?: number) {
  return sessionFormatV5ToV6.createStage({
    sourceHeader, targetHeader: sessionFormatV5ToV6.migrateHeader(sourceHeader),
    sourceInheritedEventCount, sourceKind: 'decoded',
  })
}

function migrate(events: readonly SessionFormatEvent[], sourceHeader = header, cut?: number) {
  const current = stage(sourceHeader, cut)
  const output = new SessionFormatEventCollector()
  for (const event of events) current.transformEvent(event, output)
  return { events: output.values, cut: current.finish(output) }
}

/** Strict restore of V5 rows through the assembled chain into the current generation. */
function restore(events: readonly SessionFormatEvent[], sourceHeader: SessionFormatHeader) {
  const reader = sessionFormatCatalog.createRestore({ type: 'session', ...sourceHeader }, { recovery: 'strict', validation: 'current' })
  for (const event of events) reader.decodeRow(event)
  return reader.finish()
}

describe('V5 to V6 header migration', () => {
  it('moves the version literal and preserves every other header field', () => {
    const source: SessionFormatHeader = { ...header, cwd: '/tmp/work', agentPreset: 'ptc', delegationDepth: 2, origin: 'subagent' }
    expect(sessionFormatV5ToV6.migrateHeader(source)).toEqual({ ...source, version: 6 })
  })

  it('rejects malformed V5 headers before rewriting', () => {
    expect(() => sessionFormatV5ToV6.migrateHeader({ ...header, extra: 1 })).toThrow('unexpected field')
    expect(() => sessionFormatV5ToV6.migrateHeader({ ...header, version: 4 })).toThrow('expected format v5 header')
  })
})

describe('V5 to V6 stage', () => {
  it('passes every event through unchanged', () => {
    const rows: SessionFormatEvent[] = [fact, { type: 'turn/start', seq: 1, time: 3, data: { turn: 1 } }]
    const { events, cut } = migrate(rows)
    expect(events).toEqual(rows)
    expect(cut).toBe(0)
  })

  it('passes compact runs through unchanged', () => {
    const current = stage()
    const run: SessionFormatEventRun = {
      runType: 'assistant-stream', firstSeq: 0, eventCount: 1,
      expand: () => [],
    }
    const emitted: SessionFormatEventRun[] = []
    current.transformRun(run, { emitRun: value => void emitted.push(value), emitEvent: () => {} })
    expect(emitted).toEqual([run])
  })

  it('keeps the inherited cut at zero for an unseeded source without reading bodies', () => {
    expect(stage().headerInheritedEventCount).toBe(0)
  })

  it('derives a seeded cut from the last inherited end-seed marker', () => {
    const seeded: SessionFormatHeader = { ...header, isSeeded: true }
    expect(stage(seeded).headerInheritedEventCount).toBeUndefined()
    const { cut } = migrate([fact, { type: 'session/end-seed', seq: 1, time: 3, data: { inherited: true } }], seeded)
    expect(cut).toBe(1)
  })

  it('refuses a seeded source without an inherited end-seed marker', () => {
    expect(() => migrate([fact], { ...header, isSeeded: true })).toThrow('no inherited end-seed marker')
  })
})

describe('V5 rows restored into V6', () => {
  it('restores a V5 Session through the assembled chain at the current writer version', () => {
    const rows: SessionFormatEvent[] = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    const artifact = restore(rows, header)
    expect(artifact.header.version).toBe(SESSION_FORMAT_VERSION)
    expect(artifact.events).toEqual(rows)
    expect(artifact.inheritedEventCount).toBe(0)
  })

  it('accepts V5 packed rows through the released V5 codec', () => {
    const row = releasedV5SessionFormatCodec.encodeEvent({ type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } })
    const reader = sessionFormatCatalog.createRestore({ type: 'session', ...header }, { recovery: 'strict', validation: 'current' })
    reader.decodeRow(row)
    expect(reader.finish().header.version).toBe(SESSION_FORMAT_VERSION)
  })
})
