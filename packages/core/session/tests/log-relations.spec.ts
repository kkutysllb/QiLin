/** The committed log keeps its relational contract: one monotone seq, turn/step enclosure, and closed tool calls. */

import { describe, expect, it, onTestFinished } from 'vitest'
import { Context } from '@qilin/kylin'
import { createMessage, createUserMessage, ToolCallId, createToolResultMessage } from '@qilin/llm'
import SessionStore, { SessionId, type SessionEvent } from '@qilin/session'

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  onTestFinished(() => void ctx.fiber.dispose())
  return ctx
}

/** Walk one realistic turn and return the committed events. */
function appendTurn(session: ReturnType<Context['sessions']['create']>): readonly SessionEvent[] {
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/attempt', {
    turn: 1, step: 1,
    stream: [{ type: 'text-chunks', time0: 1, index: 0, dt: [], texts: ['h'] }],
  })
  session.append('assistant/message', {
    stream: [],
    turn: 1,
    step: 1,
    message: createMessage({
      role: 'assistant',
      content: [{ type: 'tool-call', id: ToolCallId('c1'), name: 'echo', arguments: '{}' }],
      source: {
        kind: 'model',
        ...{ provider: 'mock', model: 'mock' },
      },
    }),
  }, { surfaceOp: 'append' })
  session.append('tool/call', { turn: 1, step: 1, callId: ToolCallId('c1'), name: 'echo', arguments: '{}' })
  session.append('tool/result', {
    turn: 1, step: 1,
    message: createToolResultMessage({
      callId: ToolCallId('c1'),
      content: [],
      isError: false,
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return session.snapshotEvents()
}

describe('committed log relations', () => {
  it('keeps seq strictly increasing across a full turn', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('log-relations-seq'))
    const events = appendTurn(session)
    expect(events.length).toBeGreaterThan(0)
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.seq).toBeGreaterThan(events[i - 1]!.seq)
    }
  })

  it('encloses every step-scoped event in its turn and closes each tool call', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('log-relations-enclosure'))
    const events = appendTurn(session)
    const openTurns = new Set<number>()
    const openSteps = new Set<string>()
    const openCalls = new Set<string>()
    for (const event of events) {
      const data = event.data as { turn?: number; step?: number; callId?: string; message?: { toolCallId?: string } }
      switch (event.type) {
        case 'turn/start': openTurns.add(data.turn!) ; break
        case 'turn/end':
          expect(openTurns.has(data.turn!)).toBe(true)
          openTurns.delete(data.turn!)
          break
        case 'step/start':
          expect(openTurns.has(data.turn!)).toBe(true)
          openSteps.add(`${data.turn}/${data.step}`)
          break
        case 'step/end':
          expect(openSteps.has(`${data.turn}/${data.step}`)).toBe(true)
          openSteps.delete(`${data.turn}/${data.step}`)
          break
        case 'tool/call': openCalls.add(data.callId!) ; break
        case 'tool/result': {
          const callId = data.message?.toolCallId
          expect(callId === undefined || openCalls.has(callId)).toBe(true)
          if (callId !== undefined) openCalls.delete(callId)
          break
        }
        default: break
      }
      if (data.turn !== undefined && event.type !== 'turn/start' && event.type !== 'turn/end') {
        expect(openTurns.has(data.turn)).toBe(true)
      }
    }
    expect([...openTurns, ...openSteps, ...openCalls]).toEqual([])
  })

  it('derives the same message kinds the committed sequence recorded', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('log-relations-derived'))
    const kinds = appendTurn(session).map(event => event.type)
    expect(kinds).toEqual([
      'turn/start', 'user/message', 'step/start', 'assistant/attempt', 'assistant/message',
      'tool/call', 'tool/result', 'step/end', 'turn/end',
    ])
  })
})
