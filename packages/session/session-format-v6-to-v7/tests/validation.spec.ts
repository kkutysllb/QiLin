import { describe, expect, it } from 'vitest'
import type { SessionFormatArtifact, SessionFormatEvent, SessionFormatJsonValue } from '@qilin-agent/session-format'
import { assertReleasedV7Header, assertReleasedV7Relationships, restoreReleasedV7Artifact } from '../src/index.ts'

const header = { version: 7, id: 'v7', createdAt: 1, isSeeded: false, delegationDepth: 0 }
const known = new Set(['turn/start', 'turn/end', 'session-log-deepseek/delivery-accepted', 'session/end-seed'])

function artifact(events: SessionFormatArtifact['events'], overrides: Partial<SessionFormatArtifact> = {}): SessionFormatArtifact {
  return { header, inheritedEventCount: 0, events, ...overrides }
}

describe('V7 header validation', () => {
  it('accepts a complete V7 header', () => {
    expect(() => { assertReleasedV7Header(header) }).not.toThrow()
    expect(() => { assertReleasedV7Header({ ...header, cwd: '/tmp', agentPreset: 'ptc', origin: 'subagent' }) }).not.toThrow()
  })

  it('refuses another version or an unexpected field', () => {
    expect(() => { assertReleasedV7Header({ ...header, version: 6 }) }).toThrow('expected format v7 header')
    expect(() => { assertReleasedV7Header({ ...header, extra: true }) }).toThrow('unexpected field')
    expect(() => { assertReleasedV7Header({ ...header, cwd: 'relative' }) }).toThrow('must be absolute')
  })
})

describe('V7 restoration', () => {
  it('accepts a dense session with known events', () => {
    const value = artifact([
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
    ])
    expect(restoreReleasedV7Artifact(value, known)).toBe(value)
  })

  it('refuses an unknown event that is not ignorable', () => {
    const value = artifact([{ type: 'unknown/required', seq: 0, time: 1, data: {} }])
    expect(() => { restoreReleasedV7Artifact(value, known) }).toThrow('unknown event type')
  })

  it('retains an unknown ignorable event', () => {
    const value = artifact([{ type: 'unknown/optional', seq: 0, time: 1, data: {}, ignorable: true }])
    expect(restoreReleasedV7Artifact(value, known)).toBe(value)
  })

  it('checks the current-generation delivery marker against the session id', () => {
    const event = (sessionId: string) => ({
      type: 'session-log-deepseek/delivery-accepted', seq: 1, time: 2,
      data: { sessionFormatVersion: 7, throughSeq: 0, sessionId },
    }) as const
    expect(() => {
      restoreReleasedV7Artifact(artifact([
        { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } }, event('v7'),
      ]), known)
    }).not.toThrow()
    expect(() => {
      restoreReleasedV7Artifact(artifact([
        { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } }, event('other'),
      ]), known)
    }).toThrow('names the wrong Session')
  })

  it('ignores delivery markers of another generation', () => {
    const value = artifact([
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'session-log-deepseek/delivery-accepted', seq: 1, time: 2,
        data: { sessionFormatVersion: 6, throughSeq: 0, sessionId: 'other' } },
    ])
    expect(restoreReleasedV7Artifact(value, known)).toBe(value)
  })
})

const delivery = (seq: number, data: unknown): SessionFormatEvent => ({
  type: 'session-log-deepseek/delivery-accepted', seq, time: seq + 1, data: data as SessionFormatJsonValue,
})
const endSeed = (seq: number, data: unknown = { inherited: true }): SessionFormatEvent => ({
  type: 'session/end-seed', seq, time: seq + 1, data: data as SessionFormatJsonValue,
})
const catalog = (seq: number, childId: string): SessionFormatEvent => ({
  type: 'subagent/catalog', seq, time: seq + 1,
  data: { version: 1, childId, childCreatedAt: 2, mode: 'unknown' },
})
const ignorable = (seq: number): SessionFormatEvent => ({
  type: 'campaign/unknown', seq, time: seq + 1, data: { x: 1 }, ignorable: true,
})
const turnStart = (seq: number): SessionFormatEvent => ({ type: 'turn/start', seq, time: seq + 1, data: { turn: 1 } })

describe('V7 inherited cuts and event density', () => {
  it('refuses a cut beyond the recorded events and an unseeded cut', () => {
    expect(() => { restoreReleasedV7Artifact(artifact([turnStart(0)], { inheritedEventCount: 2 }), known) })
      .toThrow('inherited event count exceeds its events')
    expect(() => { restoreReleasedV7Artifact(artifact([turnStart(0), turnStart(1)], { inheritedEventCount: 1 }), known) })
      .toThrow('unseeded format v7 Session has inherited events')
  })

  it('enforces dense seq coordinates', () => {
    expect(() => { restoreReleasedV7Artifact(artifact([{ type: 'turn/start', seq: 3, time: 1, data: { turn: 1 } }]), known) })
      .toThrow('format v7 event 0 is not dense')
    expect(() => { restoreReleasedV7Artifact(artifact([turnStart(0), { ...turnStart(1), seq: 3 }]), known) })
      .toThrow('format v7 event 1 is not dense')
  })
})

describe('V7 end-seed marker agreement', () => {
  it('agrees a seeded cut with the last inherited marker', () => {
    const seeded = { ...header, isSeeded: true }
    expect(restoreReleasedV7Artifact(artifact([endSeed(0)], { header: seeded }), known)).toBeDefined()
    expect(() => { restoreReleasedV7Artifact(artifact([endSeed(0)], { header: seeded, inheritedEventCount: 1 }), known) })
      .toThrow('seeded header disagrees with its last inherited end-seed marker')
    expect(() => { restoreReleasedV7Artifact(artifact([turnStart(0)], { header: seeded }), known) })
      .toThrow('seeded header disagrees with its last inherited end-seed marker')
  })

  it('refuses an inherited marker on an unseeded Session', () => {
    expect(() => { restoreReleasedV7Artifact(artifact([endSeed(0)]), known) })
      .toThrow('format v7 unseeded Session contains an inherited end-seed marker')
  })

  it('reads an end-seed payload only when it is an object flagging inheritance', () => {
    // The marker scan ignores a non-object payload, which lifecycle validation then rejects.
    expect(() => { restoreReleasedV7Artifact(artifact([endSeed(0, 'inherited')]), known) })
      .toThrow('session/end-seed requires an object')
    // An object without `inherited: true` leaves the cut untouched.
    expect(restoreReleasedV7Artifact(artifact([endSeed(0, {})]), known)).toBeDefined()
    expect(restoreReleasedV7Artifact(artifact([endSeed(0, { inherited: false })]), known)).toBeDefined()
  })
})

describe('V7 delivery coordinates and ownership', () => {
  const DELIVERY = 'session-log-deepseek/delivery-accepted'
  const assertDelivery = (payload: unknown, overrides: Partial<SessionFormatArtifact> = {}): void => {
    assertReleasedV7Relationships(artifact([ignorable(0), delivery(1, payload)], overrides), new Set([DELIVERY]))
  }

  it('validates delivery generation coordinates', () => {
    expect(() => { assertDelivery(null) }).toThrow('delivery-accepted data must be an object')
    // An absent generation reads as 0, which is not the current one.
    expect(() => { assertDelivery({ throughSeq: 0, sessionId: 'v7' }) }).not.toThrow()
    expect(() => { assertDelivery({ sessionFormatVersion: 7, throughSeq: 1, sessionId: 'v7' }) })
      .toThrow('delivery throughSeq must precede its marker')
    expect(() => { assertDelivery({ sessionFormatVersion: 7, throughSeq: 0, sessionId: 3 }) })
      .toThrow('delivery requires a nonempty Session id')
    expect(() => { assertDelivery({ sessionFormatVersion: 7, throughSeq: 0, sessionId: '' }) })
      .toThrow('delivery requires a nonempty Session id')
    expect(() => { assertDelivery({ sessionFormatVersion: 7, throughSeq: 0, sessionId: 'v7' }) }).not.toThrow()
    // Another generation's coordinates are left alone.
    expect(() => { assertDelivery({ sessionFormatVersion: 6, throughSeq: 9, sessionId: 'other' }) }).not.toThrow()
  })

  it('accepts an inherited marker naming the parent and checks the rest', () => {
    const inherited = { header: { ...header, isSeeded: true, parentSession: 'parent' }, inheritedEventCount: 2 }
    expect(() => { assertDelivery({ sessionFormatVersion: 7, throughSeq: 0, sessionId: 'parent' }, inherited) }).not.toThrow()
    // Past the inherited prefix the marker is this Session's own, so the parent id is wrong.
    expect(() => {
      assertDelivery(
        { sessionFormatVersion: 7, throughSeq: 0, sessionId: 'parent' },
        { header: { ...header, parentSession: 'parent' }, inheritedEventCount: 1 },
      )
    }).toThrow('names the wrong Session')
    // Inside the inherited prefix the marker belongs to the parent, so its id
    // is not compared with this Session.
    expect(() => {
      assertDelivery(
        { sessionFormatVersion: 7, throughSeq: 0, sessionId: 'other' },
        { header: { ...header, parentSession: 'parent' }, inheritedEventCount: 2 },
      )
    }).not.toThrow()
  })
})

describe('V7 catalog ownership', () => {
  const CATALOG = new Set(['subagent/catalog', 'session/end-seed'])

  it('deduplicates current-generation catalog children', () => {
    expect(() => { assertReleasedV7Relationships(artifact([catalog(0, 'child-1'), catalog(1, 'child-2')]), CATALOG) })
      .not.toThrow()
    expect(() => { assertReleasedV7Relationships(artifact([catalog(0, 'child-1'), catalog(1, 'child-1')]), CATALOG) })
      .toThrow('duplicate catalog child child-1')
  })

  it('leaves inherited catalog children to the parent', () => {
    expect(() => {
      assertReleasedV7Relationships(
        artifact([catalog(0, 'child-1'), catalog(1, 'child-1'), endSeed(2)], {
          header: { ...header, isSeeded: true },
          inheritedEventCount: 2,
        }),
        CATALOG,
      )
    }).not.toThrow()
  })

  it('accepts the named V3 catalog fact', () => {
    const named = { type: 'subagent/catalog', seq: 0, time: 1,
      data: { version: 3, childId: 'child-1', childCreatedAt: 2, mode: 'continuable', label: 'checker', name: 'reviewer' } } as const
    expect(() => { assertReleasedV7Relationships(artifact([named]), CATALOG) }).not.toThrow()
  })
})

describe('V7 Team mode', () => {
  const TEAM = new Set(['team/mode', 'turn/start'])
  const mode = (seq: number, data: unknown): SessionFormatEvent => ({
    type: 'team/mode', seq, time: seq + 1, data: data as SessionFormatJsonValue,
  })

  it('accepts one composition-driven transition', () => {
    const value = artifact([mode(0, { mode: 'on', source: 'composition' }), turnStart(1)])
    expect(restoreReleasedV7Artifact(value, TEAM)).toBe(value)
  })

  it('accepts a mode payload without a source', () => {
    expect(restoreReleasedV7Artifact(artifact([mode(0, { mode: 'on' })]), TEAM)).toBeDefined()
  })

  it('accepts leaving Team mode', () => {
    const value = artifact([mode(0, { mode: 'on' }), mode(1, { mode: 'off' })])
    expect(restoreReleasedV7Artifact(value, TEAM)).toBe(value)
  })

  it('refuses a repeated mode', () => {
    expect(() => { restoreReleasedV7Artifact(artifact([mode(0, { mode: 'on' }), mode(1, { mode: 'on' })]), TEAM) })
      .toThrow('team/mode repeats on')
    expect(() => { restoreReleasedV7Artifact(artifact([mode(0, { mode: 'off' })]), TEAM) })
      .toThrow('team/mode repeats off')
  })

  it('refuses a malformed payload, an unknown field, and an unsupported source', () => {
    expect(() => { restoreReleasedV7Artifact(artifact([mode(0, null)]), TEAM) })
      .toThrow('team/mode data must be an object')
    expect(() => { restoreReleasedV7Artifact(artifact([mode(0, { mode: 'maybe' })]), TEAM) })
      .toThrow('team/mode requires mode')
    expect(() => { restoreReleasedV7Artifact(artifact([mode(0, { mode: 'on', teamId: 'x' })]), TEAM) })
      .toThrow('unexpected field "teamId"')
    expect(() => { restoreReleasedV7Artifact(artifact([mode(0, { mode: 'on', source: 'command' })]), TEAM) })
      .toThrow('unsupported source')
  })

  it('refuses Team mode when the installed build does not know the event type', () => {
    expect(() => { restoreReleasedV7Artifact(artifact([mode(0, { mode: 'on' })]), new Set()) })
      .toThrow('unknown event type "team/mode"')
  })
})
