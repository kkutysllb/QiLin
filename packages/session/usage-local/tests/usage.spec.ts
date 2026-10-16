import { describe, expect, it } from 'vitest'
import { MessageId } from '@qilin-agent/llm'
import type { SessionEvent } from '@qilin-agent/session/types'
import { collectSessionUsage, readWindow, totalOf, usageAnswer, withinWindow } from '../src/usage.ts'

function event<T extends SessionEvent['type']>(
  seq: number, time: number, type: T, data: Extract<SessionEvent, { type: T }>['data'],
): Extract<SessionEvent, { type: T }> {
  return { seq, time, type, data } as Extract<SessionEvent, { type: T }>
}

const USAGE = {
  inputTokens: 100,
  outputTokens: 20,
  totalTokens: 170,
  cacheReadTokens: 50,
}

/** One complete, provable Turn: start, step, a usage-bearing message, end. */
function completeTurn(startSeq: number, startAt: number, turn: number): SessionEvent[] {
  return [
    event(startSeq, startAt, 'turn/start', { turn }),
    event(startSeq + 1, startAt + 1000, 'step/start', { turn, step: 1 }),
    event(startSeq + 2, startAt + 2000, 'assistant/message', {
      turn,
      step: 1,
      stream: [{ type: 'chunk', time: startAt + 2000, chunk: { type: 'usage', usage: USAGE } }],
      message: {
        id: MessageId(`message-${String(turn)}`),
        role: 'assistant',
        content: [{ type: 'text', text: 'done' }],
        source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' },
      },
    }),
    event(startSeq + 3, startAt + 3000, 'step/end', { turn, step: 1 }),
    event(startSeq + 4, startAt + 4000, 'turn/end', { turn, reason: { kind: 'completed' } }),
  ]
}

describe('collectSessionUsage', () => {
  it('folds complete Turns into records stamped with their end time', () => {
    const events = [
      ...completeTurn(1, 1000, 1),
      ...completeTurn(100, 5000, 2),
    ]
    expect(collectSessionUsage('session-a', events)).toEqual([
      { sessionId: 'session-a', turn: 1, inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, at: 5000 },
      { sessionId: 'session-a', turn: 2, inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, at: 9000 },
    ])
  })

  it('carries the cache-write bucket when every attempt reports it', () => {
    const events = [
      event(1, 1000, 'turn/start', { turn: 1 }),
      event(2, 1100, 'step/start', { turn: 1, step: 1 }),
      event(3, 1200, 'assistant/message', {
        turn: 1,
        step: 1,
        stream: [{ type: 'chunk', time: 1200, chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 20, totalTokens: 182, cacheReadTokens: 50, cacheWriteTokens: 12 } } }],
        message: {
          id: MessageId('message-1'),
          role: 'assistant',
          content: [{ type: 'text', text: 'done' }],
          source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' },
        },
      }),
      event(4, 1300, 'step/end', { turn: 1, step: 1 }),
      event(5, 1400, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ]
    expect(collectSessionUsage('session-a', events)).toEqual([
      { sessionId: 'session-a', turn: 1, inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 12, at: 1400 },
    ])
  })

  it('skips a Turn the derivation cannot prove and events outside any Turn', () => {
    const events = [
      event(1, 1000, 'user/message', { id: MessageId('user-1'), role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }),
      ...completeTurn(10, 2000, 1),
      // An aborted attempt has no provable usage: the Turn yields nothing.
      event(30, 3000, 'turn/start', { turn: 2 }),
      event(31, 3100, 'step/start', { turn: 2, step: 1 }),
      event(32, 3200, 'step/end', { turn: 2, step: 1 }),
      event(33, 3300, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
    ]
    const records = collectSessionUsage('session-a', events)
    expect(records.map(record => record.turn)).toEqual([1])
  })
})

describe('withinWindow', () => {
  const records = [
    { sessionId: 's', turn: 1, inputTokens: 1, outputTokens: 1, at: 1000 },
    { sessionId: 's', turn: 2, inputTokens: 1, outputTokens: 1, at: 2000 },
    { sessionId: 's', turn: 3, inputTokens: 1, outputTokens: 1, at: 3000 },
  ]

  it('keeps the Turns inside the inclusive window', () => {
    expect(withinWindow(records, 1000, 2000).map(record => record.turn)).toEqual([1, 2])
    expect(withinWindow(records, 2000, undefined).map(record => record.turn)).toEqual([2, 3])
  })
})

describe('totalOf', () => {
  it('totals every bucket, counts distinct sessions, and derives the hit rate', () => {
    expect(totalOf([
      { sessionId: 'a', turn: 1, inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10, at: 1 },
      { sessionId: 'b', turn: 1, inputTokens: 40, outputTokens: 5, at: 2 },
    ])).toEqual({
      sessions: 2,
      turns: 2,
      inputTokens: 140,
      outputTokens: 25,
      cacheReadTokens: 50,
      cacheWriteTokens: 10,
      cacheHitRate: 50 / 140,
    })
  })

  it('answers a zero hit rate when no Turn billed input', () => {
    expect(totalOf([{ sessionId: 'a', turn: 1, inputTokens: 0, outputTokens: 3, at: 1 }]).cacheHitRate).toBe(0)
  })
})

describe('usageAnswer', () => {
  it('names the account, totals the whole ledger, and lists the window in end-time order', () => {
    const newer = { sessionId: 'a', turn: 2, inputTokens: 10, outputTokens: 1, at: 3000 }
    const older = { sessionId: 'a', turn: 1, inputTokens: 20, outputTokens: 2, at: 1000 }
    const all = [newer, older]
    const answer = usageAnswer('local', all, [older, newer])
    expect(answer).toEqual({
      accountId: 'local',
      total: {
        sessions: 1, turns: 2, inputTokens: 30, outputTokens: 3,
        cacheReadTokens: 0, cacheWriteTokens: 0, cacheHitRate: 0,
      },
      records: [all[1], all[0]],
      truncated: false,
    })
  })
})

describe('readWindow', () => {
  const url = (search: string): URL => new URL(`http://127.0.0.1:3080/api/usage/me${search}`)

  it('reads the epoch-milliseconds window from the query string', () => {
    expect(readWindow(url('?from=100&to=200'))).toEqual({ from: 100, to: 200 })
    expect(readWindow(url('?from=100'))).toEqual({ from: 100 })
    expect(readWindow(url('?'))).toEqual({ from: 0 })
  })

  it('refuses a malformed or inverted window', () => {
    expect(readWindow(url('?from=abc'))).toBeUndefined()
    expect(readWindow(url('?from=-5'))).toBeUndefined()
    expect(readWindow(url('?from=200&to=100'))).toBeUndefined()
  })
})
