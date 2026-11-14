import { describe, expect, it } from 'vitest'
import { SessionFormatEventCollector } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatHeader } from '@qilin-agent/session-format'
import { releasedV7SessionFormatCodec, releasedV8SessionFormatCodec, sessionFormatV7ToV8 } from '../src/index.ts'

const header: SessionFormatHeader = { version: 7, id: 'identity', createdAt: 1, isSeeded: false, delegationDepth: 0 }
const fact: SessionFormatEvent = { type: 'feedback/record', seq: 0, time: 2, data: { text: 'retained' } }

function stage(sourceHeader = header, sourceInheritedEventCount?: number) {
  return sessionFormatV7ToV8.createStage({
    sourceHeader, targetHeader: sessionFormatV7ToV8.migrateHeader(sourceHeader),
    sourceInheritedEventCount, sourceKind: 'decoded',
  })
}

function migrate(events: readonly SessionFormatEvent[], sourceHeader = header, cut?: number) {
  const current = stage(sourceHeader, cut)
  const output = new SessionFormatEventCollector()
  for (const event of events) current.transformEvent(event, output)
  return { events: output.values, cut: current.finish(output) }
}

describe('V7 to V8 header migration', () => {
  it('renames the stored coding preset and preserves every other header field', () => {
    const source: SessionFormatHeader = { ...header, cwd: '/tmp/work', agentPreset: 'ptc', delegationDepth: 2, origin: 'subagent' }
    expect(sessionFormatV7ToV8.migrateHeader(source)).toEqual({ ...source, version: 8, agentPreset: 'coding' })
  })

  it('moves the version literal without inventing a preset', () => {
    const source: SessionFormatHeader = { ...header, cwd: '/tmp/work' }
    const migrated = sessionFormatV7ToV8.migrateHeader(source)
    expect(migrated).toEqual({ ...source, version: 8 })
    expect(Object.hasOwn(migrated, 'agentPreset')).toBe(false)
  })

  it('keeps a user-authored preset id as it is', () => {
    expect(sessionFormatV7ToV8.migrateHeader({ ...header, agentPreset: 'mine' })).toMatchObject({ agentPreset: 'mine' })
  })

  it('rejects malformed V7 headers before rewriting', () => {
    expect(() => sessionFormatV7ToV8.migrateHeader({ ...header, extra: 1 })).toThrow('unexpected field')
    expect(() => sessionFormatV7ToV8.migrateHeader({ ...header, version: 6 })).toThrow('expected format v7 header')
  })
})

describe('V7 to V8 event migration', () => {
  it('renames the preset one selection event recorded', () => {
    const selected: SessionFormatEvent = { type: 'agent-preset/selected', seq: 0, time: 2, data: { agentPreset: 'ptc' } }
    expect(migrate([selected]).events).toEqual([{ ...selected, data: { agentPreset: 'coding' } }])
  })

  it('passes every other event through unchanged', () => {
    const events = [fact, { type: 'agent-preset/selected', seq: 1, time: 3, data: { agentPreset: 'standard' } }] as const
    expect(migrate(events).events).toEqual([...events])
  })

  it('keeps the inherited cut at zero for an unseeded source', () => {
    expect(migrate([fact]).cut).toBe(0)
  })

  it('derives a seeded cut from the last inherited end-seed marker', () => {
    const marker: SessionFormatEvent = { type: 'session/end-seed', seq: 1, time: 3, data: { inherited: true } }
    expect(migrate([marker], { ...header, isSeeded: true }).cut).toBe(1)
  })

  it('refuses a seeded source without an inherited end-seed marker', () => {
    expect(() => migrate([fact], { ...header, isSeeded: true })).toThrow('no inherited end-seed marker')
  })
})

describe('V8 framing', () => {
  it('frames V7 rows through the released codec and reports the V8 writer version', () => {
    const encoded = releasedV7SessionFormatCodec.encodeHeader(header, 0)
    expect(encoded['version']).toBe(7)
    expect(releasedV8SessionFormatCodec.version).toBe(8)
    expect(releasedV8SessionFormatCodec.encodeHeader({ ...header, version: 8 }, 0)['version']).toBe(8)
    expect(releasedV8SessionFormatCodec.decodeHeader({ ...encoded, version: 8 })['version']).toBe(8)
  })
})
