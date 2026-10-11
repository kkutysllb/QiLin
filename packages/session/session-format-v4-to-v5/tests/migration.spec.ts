import { describe, expect, it } from 'vitest'
import { SessionFormatEventCollector } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatHeader } from '@qilin-agent/session-format'
import { sessionFormatCatalog } from '@qilin-agent/session-format-catalog'
import { releasedV4SessionFormatCodec } from '@qilin-agent/session-format-v3-to-v4'
import { foldRetiredPresetId, releasedV5SessionFormatCodec, sessionFormatV4ToV5 } from '../src/index.ts'

const header: SessionFormatHeader = { version: 4, id: 'identity', createdAt: 1, isSeeded: false, delegationDepth: 0 }
const fact: SessionFormatEvent = { type: 'feedback/record', seq: 0, time: 2, data: { text: 'retained' } }

function stage(sourceHeader = header, sourceInheritedEventCount?: number) {
  return sessionFormatV4ToV5.createStage({
    sourceHeader, targetHeader: sessionFormatV4ToV5.migrateHeader(sourceHeader),
    sourceInheritedEventCount, sourceKind: 'decoded',
  })
}

function migrate(events: readonly SessionFormatEvent[], sourceHeader = header, cut?: number) {
  const current = stage(sourceHeader, cut)
  const output = new SessionFormatEventCollector()
  for (const event of events) current.transformEvent(event, output)
  return { events: output.values, cut: current.finish(output) }
}

/** Strict restore of V4 rows through the assembled chain into the current generation. */
function restore(events: readonly SessionFormatEvent[], sourceHeader: SessionFormatHeader) {
  const reader = sessionFormatCatalog.createRestore({ type: 'session', ...sourceHeader }, { recovery: 'strict', validation: 'current' })
  for (const event of events) reader.decodeRow(event)
  return reader.finish()
}

const selected = (seq: number, agentPreset: string): SessionFormatEvent => ({
  type: 'agent-preset/selected', seq, time: seq + 2, data: { agentPreset },
})

describe('V4 to V5 header migration', () => {
  it.each(['standard', 'cordis', 'minimal'] as const)('folds retired shipped id %s onto ptc', (retired) => {
    const migrated = sessionFormatV4ToV5.migrateHeader({ ...header, agentPreset: retired })
    expect(migrated).toEqual({ ...header, version: 5, agentPreset: 'ptc' })
  })

  it('keeps custom preset ids and absent values unchanged', () => {
    expect(sessionFormatV4ToV5.migrateHeader({ ...header, agentPreset: 'my-preset' }))
      .toEqual({ ...header, version: 5, agentPreset: 'my-preset' })
    expect(sessionFormatV4ToV5.migrateHeader(header)).toEqual({ ...header, version: 5 })
  })

  it('rejects malformed V4 headers before rewriting', () => {
    expect(() => sessionFormatV4ToV5.migrateHeader({ ...header, extra: 1 })).toThrow('unexpected field')
  })
})

describe('foldRetiredPresetId', () => {
  it.each([
    ['standard', 'ptc'], ['cordis', 'ptc'], ['minimal', 'ptc'],
    ['ptc', 'ptc'], ['my-preset', 'my-preset'],
  ])('maps %s to %s', (input, expected) => {
    expect(foldRetiredPresetId(input)).toBe(expected)
  })
})

describe('V4 to V5 stage', () => {
  it('rewrites retired ids in selection events and passes every other event through unchanged', () => {
    const rows: SessionFormatEvent[] = [
      selected(0, 'standard'),
      fact,
      selected(2, 'cordis'),
      selected(3, 'ptc'),
      selected(4, 'my-preset'),
    ]
    const input = structuredClone(rows)
    const { events } = migrate(rows)
    expect(events).toEqual([
      selected(0, 'ptc'),
      fact,
      selected(2, 'ptc'),
      rows[3],
      rows[4],
    ])
    expect(events[1]).toBe(rows[1])
    expect(structuredClone(rows)).toEqual(input)
  })

  it('returns a zero cut for unseeded sources before EOF', () => {
    expect(stage().headerInheritedEventCount).toBe(0)
    const { cut } = migrate([fact])
    expect(cut).toBe(0)
  })

  it('derives the seeded cut from its last inherited end-seed marker', () => {
    const seeded = { ...header, isSeeded: true }
    const marker: SessionFormatEvent = { type: 'session/end-seed', seq: 1, time: 3, data: { inherited: true } }
    const stage = migrate([selected(0, 'standard'), marker, fact], seeded, 2)
    expect(stage.cut).toBe(1)
    expect(stage.events.map(event => event.type === 'agent-preset/selected'
      ? (event.data as { agentPreset: string }).agentPreset : event.type))
      .toEqual(['ptc', 'session/end-seed', 'feedback/record'])
  })

  it('refuses a seeded source without an inherited end-seed marker', () => {
    expect(() => migrate([fact], { ...header, isSeeded: true }, 1)).toThrow('no inherited end-seed marker')
  })
})

describe('V4 to V5 strict restoration through the assembled catalog', () => {
  it('publishes folded headers and rewritten selections at v5 from direct V4 input', () => {
    const rows: SessionFormatEvent[] = [
      selected(0, 'standard'),
      selected(1, 'cordis'),
      selected(2, 'my-preset'),
      { ...fact, seq: 3, time: 5 },
    ]
    const restored = restore(rows, { ...header, agentPreset: 'cordis' })
    expect(restored.header).toEqual({ ...header, version: 5, agentPreset: 'ptc' })
    expect(restored.events.filter(event => event.type === 'agent-preset/selected')
      .map(event => (event.data as { agentPreset: string }).agentPreset))
      .toEqual(['ptc', 'ptc', 'my-preset'])
    expect(restored.inheritedEventCount).toBe(0)
  })

  it('keeps seeded multi-hop restoration exact through V5', () => {
    const seeded = { ...header, isSeeded: true }
    const rows: SessionFormatEvent[] = [
      selected(0, 'minimal'),
      { type: 'session/end-seed', seq: 1, time: 3, data: { inherited: true } },
      { ...fact, seq: 2 },
    ]
    const restored = restore(rows, seeded)
    expect(restored.header).toEqual({ ...seeded, version: 5 })
    expect((restored.events[0]!.data as { agentPreset: string }).agentPreset).toBe('ptc')
    expect(restored.inheritedEventCount).toBe(1)
  })

  it('refuses unknown non-ignorable V5 event types', () => {
    const unknown = { type: 'session/unknown-future', seq: 0, time: 1, data: {} } as unknown as SessionFormatEvent
    expect(() => restore([unknown], header)).toThrow('format v5 contains unknown event type')
  })
})

describe('released V5 codec', () => {
  it('roundtrips a folded header and events through the released framing', () => {
    const v5Header = { ...header, version: 5 as const, agentPreset: 'ptc' }
    const rows: SessionFormatEvent[] = [selected(0, 'ptc'), fact]
    const physicalHeader = releasedV5SessionFormatCodec.encodeHeader(v5Header, 0)
    expect(physicalHeader['version']).toBe(5)
    expect(releasedV5SessionFormatCodec.decodeHeader(physicalHeader)).toEqual(v5Header)
    expect(rows.map(row => releasedV5SessionFormatCodec.encodeEvent(row)))
      .toEqual(rows.map(row => releasedV4SessionFormatCodec.encodeEvent(row)))
  })

  it('rejects a native V5 header outside its released shape', () => {
    expect(() => releasedV5SessionFormatCodec.encodeHeader({ ...header, version: 5, agentPreset: 'ptc', extra: true }, 0))
      .toThrow('unexpected field')
  })
})
