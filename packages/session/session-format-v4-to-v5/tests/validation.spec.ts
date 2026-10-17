import { describe, expect, it } from 'vitest'
import type { SessionFormatArtifact, SessionFormatHeader, SessionFormatJsonObject } from '@qilin-agent/session-format'
import { assertReleasedV5Header, assertReleasedV5Relationships, restoreReleasedV5Artifact } from '../src/index.ts'

const KNOWN = new Set([
  'turn/start', 'step/start', 'assistant/message', 'tool/call', 'tool/result', 'step/end', 'turn/end',
  'user/message', 'session/end-seed',
])

function header(overrides: Partial<Record<string, unknown>> = {}): SessionFormatHeader {
  return {
    version: 5,
    id: 'v5-session',
    createdAt: 1,
    isSeeded: false,
    delegationDepth: 0,
    ...overrides,
  }
}

function artifact(events: readonly Record<string, unknown>[], h = header(), inherited = 0): SessionFormatArtifact {
  return {
    header: h,
    inheritedEventCount: inherited,
    events: events as unknown as SessionFormatArtifact['events'],
  }
}

/** One canonical released-v5 turn: call a tool and receive its result. */
function conversation(): Record<string, unknown>[] {
  const message = (
    id: string,
    role: string,
    content: SessionFormatJsonObject[],
    source: SessionFormatJsonObject,
  ): SessionFormatJsonObject => (
    { id, role, content, source }
  )
  return [
    { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
    { type: 'step/start', seq: 1, time: 2, data: { turn: 1, step: 1 } },
    {
      type: 'assistant/message', seq: 2, time: 3, surfaceOp: 'append',
      data: {
        turn: 1, step: 1,
        message: message('assistant-1', 'assistant', [
          { type: 'text', text: 'calling' },
          { type: 'tool-call', id: 'call-1', name: 'bash', arguments: '{}' },
        ], { kind: 'model', provider: 'mock', model: 'mock' }),
        stream: [],
      },
    },
    {
      type: 'tool/call', seq: 3, time: 4,
      data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{}' },
    },
    {
      type: 'tool/result', seq: 4, time: 5, surfaceOp: 'append',
      data: {
        turn: 1, step: 1,
        message: { ...message('tool-1', 'tool', [{ type: 'text', text: 'ok' }], { kind: 'tool', callId: 'call-1' }),
          toolCallId: 'call-1', isError: false },
      },
    },
    { type: 'step/end', seq: 5, time: 6, data: { turn: 1, step: 1 } },
    { type: 'turn/end', seq: 6, time: 7, data: { turn: 1, reason: { kind: 'completed' } } },
  ]
}

const ignorable = (seq: number) => ({ type: 'campaign/unknown', seq, time: seq + 1, ignorable: true, data: { x: 1 } })
const delivery = (seq: number, data: unknown) => ({
  type: 'session-log-deepseek/delivery-accepted', seq, time: seq + 1, data,
})
const marker = (seq: number, inherited = true) => ({
  type: 'session/end-seed', seq, time: seq + 1, data: { ...(inherited ? { inherited: true } : {}) },
})

describe('assertReleasedV5Header', () => {
  it('accepts the minimal and complete header images', () => {
    expect(() => { assertReleasedV5Header(header()) }).not.toThrow()
    expect(() => { assertReleasedV5Header(header({
      cwd: '/work', parentSession: 'parent', origin: 'subagent', agentPreset: 'ptc', isSeeded: true,
    })) }).not.toThrow()
  })

  it('refuses malformed headers', () => {
    const malformed: Array<[string, unknown, RegExp]> = [
      ['non-object', null, /expected format v5 header/],
      ['wrong version', { ...header(), version: 4 }, /expected format v5 header/],
      ['missing field', { version: 5, id: 'v5-session', isSeeded: false, delegationDepth: 0 }, /lacks required field createdAt/],
      ['unexpected field', { ...header(), extra: 1 }, /unexpected field extra/],
      ['non-string id', { ...header(), id: 3 }, /id must be a string/],
      ['non-count createdAt', { ...header(), createdAt: 'x' }, /createdAt/],
      ['non-count delegationDepth', { ...header(), delegationDepth: -1 }, /delegationDepth/],
      ['non-boolean isSeeded', { ...header(), isSeeded: 1 }, /isSeeded must be boolean/],
      ['non-string cwd', { ...header(), cwd: 3 }, /cwd must be absolute/],
      ['relative cwd', { ...header(), cwd: 'work' }, /cwd must be absolute/],
      ['non-string parentSession', { ...header(), parentSession: 3 }, /parentSession must be a string/],
      ['non-string agentPreset', { ...header(), agentPreset: 3 }, /agentPreset must be a string/],
      ['invalid origin', { ...header(), origin: 'other' }, /origin must be "subagent"/],
    ]
    for (const [name, value, message] of malformed) {
      expect(() => { assertReleasedV5Header(value) }, name).toThrow(message)
    }
  })
})

describe('restoreReleasedV5Artifact', () => {
  it('validates dense envelopes, cuts, and event vocabulary', () => {
    const valid = artifact(conversation())
    expect(restoreReleasedV5Artifact(valid, KNOWN)).toBe(valid)

    expect(() => restoreReleasedV5Artifact(artifact(conversation(), header({ isSeeded: true }), 20), KNOWN))
      .toThrow(/inherited event count exceeds its events/)
    expect(() => restoreReleasedV5Artifact(artifact([marker(0)], header(), 0), KNOWN))
      .toThrow(/format v5 unseeded Session contains an inherited end-seed marker/)
    expect(() => restoreReleasedV5Artifact(artifact(conversation(), header(), 1), KNOWN))
      .toThrow(/unseeded format v5 Session has inherited events/)
  })

  it('admits ignorable unknown records and refuses required ones', () => {
    const withUnknown = [ignorable(0), ...conversation().map((event, index) => ({ ...event, seq: index + 1 }))]
    expect(() => restoreReleasedV5Artifact(artifact(withUnknown), KNOWN)).not.toThrow()

    const required = [{ type: 'campaign/unknown', seq: 0, time: 1, data: { x: 1 } }, ...conversation().slice(0, 1)]
    expect(() => restoreReleasedV5Artifact(artifact(required), KNOWN)).toThrow(/unknown event type/)
  })

  it('enforces V5-owned event density', () => {
    expect(() => restoreReleasedV5Artifact(artifact([
      { type: 'turn/start', time: 1, data: { turn: 1 } },
    ]), KNOWN)).toThrow(/is not dense/)
    const shifted = conversation()
    shifted[1] = { ...shifted[1]!, seq: 3 }
    expect(() => restoreReleasedV5Artifact(artifact(shifted), KNOWN)).toThrow(/is not dense/)
  })

  it('enforces end-seed marker agreement', () => {
    expect(() => restoreReleasedV5Artifact(
      artifact([marker(0)], header({ isSeeded: true }), 0),
      new Set([...KNOWN, 'session/end-seed']),
    )).not.toThrow()
    expect(() => restoreReleasedV5Artifact(
      artifact([marker(0, false), marker(1)], header({ isSeeded: true }), 0),
      new Set([...KNOWN, 'session/end-seed']),
    )).toThrow(/seeded header disagrees/)
    expect(() => restoreReleasedV5Artifact(
      artifact([ignorable(0), marker(1)], header({ isSeeded: true }), 2),
      new Set([...KNOWN, 'session/end-seed']),
    )).toThrow(/seeded header disagrees/)
  })

  it('refuses non-object records with non-string event types', () => {
    expect(() => restoreReleasedV5Artifact(artifact([{ type: 3, seq: 0, time: 1, data: {} }]), KNOWN))
      .toThrow(/unknown event type/)
    expect(() => restoreReleasedV5Artifact(artifact([null as never]), KNOWN))
      .toThrow()
  })
})

describe('assertReleasedV5Relationships delivery and catalog ownership', () => {
  const DELIVERY = 'session-log-deepseek/delivery-accepted'

  it('accepts a delivery marker naming its own Session', () => {
    const events = [ignorable(0), delivery(1, { sessionFormatVersion: 5, throughSeq: 0, sessionId: 'v5-session' })]
    expect(() => { assertReleasedV5Relationships(artifact(events), new Set([DELIVERY])) }).not.toThrow()
  })

  it('accepts an inherited delivery marker naming the parent Session', () => {
    const events = [
      ignorable(0),
      delivery(1, { sessionFormatVersion: 5, throughSeq: 0, sessionId: 'parent' }),
      marker(2),
    ]
    expect(() => {
      assertReleasedV5Relationships(
        artifact(events, header({ isSeeded: true, parentSession: 'parent' }), 2),
        new Set([DELIVERY, 'session/end-seed']),
      )
    }).not.toThrow()
  })

  it('refuses a delivery marker naming a different Session', () => {
    const events = [ignorable(0), delivery(1, { sessionFormatVersion: 5, throughSeq: 0, sessionId: 'other' })]
    expect(() => { assertReleasedV5Relationships(artifact(events), new Set([DELIVERY])) })
      .toThrow(/delivery marker names the wrong Session/)
    expect(() => {
      assertReleasedV5Relationships(
        artifact(events, header({ parentSession: 'parent' })),
        new Set([DELIVERY]),
      )
    }).toThrow(/delivery marker names the wrong Session/)
  })

  it('validates delivery generation coordinates', () => {
    const data = (overrides: Record<string, unknown>) => ({ sessionFormatVersion: 5, throughSeq: 0, sessionId: 'v5-session', ...overrides })
    const run = (payload: unknown): void => {
      assertReleasedV5Relationships(artifact([ignorable(0), delivery(1, payload)]), new Set([DELIVERY]))
    }
    expect(() => { run(null) }).toThrow(/must be an object/)
    expect(() => { run(data({ throughSeq: 1 })) }).toThrow(/throughSeq must precede/)
    expect(() => { run(data({ sessionId: 3 })) }).toThrow(/nonempty Session id/)
    expect(() => { run(data({ sessionId: '' })) }).toThrow(/nonempty Session id/)
    // Other generations and other event types leave the coordinates alone.
    expect(() => { run({ sessionFormatVersion: 4, throughSeq: 9, sessionId: 'other' }) }).not.toThrow()
    expect(() => { run({ throughSeq: 9, sessionId: 'other' }) }).not.toThrow()
  })

  it('tracks catalog child ids only for current-generation records', () => {
    const catalog = (seq: number, childId: string) => ({
      type: 'subagent/catalog', seq, time: seq + 1,
      data: { version: 1, childId, childCreatedAt: 2, mode: 'unknown' },
    })
    const known = new Set(['subagent/catalog'])
    expect(() => { assertReleasedV5Relationships(artifact([catalog(0, 'child-1')]), known) }).not.toThrow()
    expect(() => { assertReleasedV5Relationships(artifact([catalog(0, 'child-1'), catalog(1, 'child-1')]), known) })
      .toThrow('duplicate catalog child child-1')
    // A catalog record inside the inherited prefix belongs to the parent and is not deduplicated.
    expect(() => {
      assertReleasedV5Relationships(
        artifact([catalog(0, 'child-1'), catalog(1, 'child-1'), marker(2)],
          header({ isSeeded: true }), 2),
        new Set(['subagent/catalog', 'session/end-seed']),
      )
    }).not.toThrow()
  })
})
