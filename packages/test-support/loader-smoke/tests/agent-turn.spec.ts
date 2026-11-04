import type { Context } from '@qilin-agent/kylin'
import type { SessionEvent } from '@qilin-agent/session'
import { describe, expect, it, vi } from 'vitest'
import { runFixtureTurn } from '../src/agent-turn.ts'

type Listener = (...args: unknown[]) => void

const event = (value: object): SessionEvent => value as unknown as SessionEvent

/** One settlement flush report, as the assembled subagent service returns it. */
interface FlushReport {
  readonly woke: boolean
  readonly queued: number
  readonly unread: number
  readonly stopped?: 'deadline' | 'cancelled'
}

/** The settlement-join face a fixture composition may expose on `ctx.subagents`. */
interface SettlementFake {
  readonly awaitStopped: ReturnType<typeof vi.fn<(childId: string) => Promise<void>>>
  readonly flushSettlementNotices: ReturnType<typeof vi.fn<(parent: unknown, options: { deadlineMs: number }) => Promise<FlushReport>>>
}

function settlementFake(): SettlementFake {
  return {
    awaitStopped: vi.fn(async () => {}),
    flushSettlementNotices: vi.fn(async () => ({ woke: false, queued: 0, unread: 0 })),
  }
}

function turnHarness(options: { settlement?: SettlementFake } = {}): {
  readonly ctx: Context
  readonly session: { readonly id: string }
  readonly foreignSession: object
  readonly agent: { status: string }
  readonly emit: (session: unknown, value: object) => void
  readonly emitSubagentStart: (info: { readonly id: unknown }) => void
  readonly setFollowup: (callback: (message: { readonly id: unknown }) => void) => void
  readonly whenIdle: ReturnType<typeof vi.fn>
  readonly disposeListener: ReturnType<typeof vi.fn>
  readonly disposeSubagentStart: ReturnType<typeof vi.fn>
  readonly flush: ReturnType<typeof vi.fn>
} {
  const session = { id: 'fixture-session' }
  const foreignSession = {}
  const listeners = new Map<string, Listener[]>()
  let followup = (_message: { readonly id: unknown }): void => {}
  const whenIdle = vi.fn(async () => {})
  const disposeListener = vi.fn()
  const disposeSubagentStart = vi.fn()
  const flush = vi.fn(async () => {})
  const agent = {
    session,
    whenIdle,
    status: 'idle',
    followup: vi.fn((message: { readonly id: unknown }) => { followup(message) }),
  }
  const emitEvent = (name: string, ...args: unknown[]): void => {
    for (const listener of listeners.get(name) ?? []) listener(...args)
  }
  const ctx = {
    get: (name: string) => {
      if (name === 'agents') return { roots: () => [agent] }
      if (name === 'subagents') return options.settlement
      return undefined
    },
    on: (name: string, callback: Listener) => {
      listeners.set(name, [...listeners.get(name) ?? [], callback])
      return name === 'subagent/start' ? disposeSubagentStart : disposeListener
    },
    sessions: { flush },
  } as unknown as Context
  return {
    ctx,
    session,
    foreignSession,
    agent,
    emit: (target, value) => { emitEvent('session/event', target, event(value)) },
    emitSubagentStart: (info) => { emitEvent('subagent/start', info) },
    setFollowup: (callback) => { followup = callback },
    whenIdle,
    disposeListener,
    disposeSubagentStart,
    flush,
  }
}

describe('runFixtureTurn', () => {
  it.each([
    ['no agent registry', undefined, 0],
    ['multiple roots', { roots: () => [{}, {}] }, 2],
  ])('rejects %s', async (_label, registry, count) => {
    const ctx = { get: () => registry, on: () => () => {} } as unknown as Context
    await expect(runFixtureTurn(ctx, { task: 'ignored' }))
      .rejects.toThrow(`fixture turn requires exactly one top-level agent, found ${count}`)
  })

  it('waits for the configured agent to publish before requiring it', async () => {
    // Configured agents publish asynchronously, so an initially empty registry
    // waits for agent/created instead of rejecting.
    const roots: object[] = []
    let created: (() => void) | undefined
    const dispose = vi.fn()
    const ctx = {
      get: (name: string) => name === 'agents' ? { roots: () => [...roots] } : undefined,
      on: (name: string, callback: () => void) => {
        if (name === 'agent/created') created = callback
        return dispose
      },
    } as unknown as Context
    const pending = runFixtureTurn(ctx, { task: 'ignored' })
    // Publication with a second root still fails the exactly-one requirement,
    // proving the count is re-checked after the wait.
    roots.push({}, {})
    created?.()
    await expect(pending).rejects.toThrow('fixture turn requires exactly one top-level agent, found 2')
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('observes only the owned interval and returns its final text and deduplicated usage', async () => {
    const harness = turnHarness()
    const observed: SessionEvent[] = []
    harness.setFollowup((message) => {
      harness.emit(harness.foreignSession, {
        type: 'assistant/message', seq: 0, time: 0, data: { stream: [], message: { content: [] } },
      })
      harness.emit(harness.session, {
        type: 'step/start', seq: 0, time: 0, data: { turn: 1, step: 1 },
      })
      harness.emit(harness.session, {
        type: 'agent/inbox/spliced', seq: 1, time: 1, data: { inserted: [{ id: 'other' }] },
      })
      harness.emit(harness.session, {
        type: 'agent/inbox/spliced', seq: 2, time: 2, data: { inserted: [message] },
      })
      harness.emit(harness.session, {
        type: 'assistant/attempt', seq: 3, time: 3,
        data: {
          turn: 1,
          step: 1,
          stream: [
            { type: 'text-chunks', time0: 3, index: 0, dt: [], texts: ['partial'] },
            {
              type: 'chunk', time: 4,
              chunk: {
                type: 'usage', usage: { inputTokens: 2, outputTokens: 3, reasoningTokens: 1 },
              },
            },
          ],
        },
      })
      harness.emit(harness.session, {
        type: 'feedback/record', seq: 4, time: 4, data: { text: 'interleaved' },
      })
      harness.emit(harness.session, {
        type: 'assistant/message', seq: 5, time: 5,
        data: {
          turn: 1,
          step: 1,
          stream: [],
          message: { content: [{ type: 'text', text: 'final answer' }] },
          usage: { inputTokens: 4, outputTokens: 5, cacheReadTokens: 6 },
        },
      })
      harness.emit(harness.session, {
        type: 'assistant/attempt', seq: 6, time: 6,
        data: {
          turn: 1,
          step: 2,
          stream: [{
            type: 'chunk', time: 6,
            chunk: {
              type: 'usage',
              usage: { inputTokens: 1, outputTokens: 2, cacheWriteTokens: 7, reasoningTokens: 2 },
            },
          }],
        },
      })
      harness.emit(harness.session, {
        type: 'assistant/message', seq: 7, time: 7,
        data: { turn: 1, step: 2, stream: [], message: { content: [{ type: 'tool-call' }] } },
      })
      harness.emit(harness.session, {
        type: 'assistant/attempt', seq: 8, time: 8,
        data: {
          turn: 1,
          step: 3,
          stream: [{ type: 'text-chunks', time0: 8, index: 0, dt: [], texts: ['no usage'] }],
        },
      })
      harness.emit(harness.foreignSession, {
        type: 'assistant/message', seq: 9, time: 9, data: { stream: [], message: { content: [] } },
      })
    })

    await expect(runFixtureTurn(harness.ctx, {
      task: 'prove the fixture',
      onEvent: (_sessionId, current) => { observed.push(current) },
    })).resolves.toEqual({
      type: 'result',
      sessionId: 'fixture-session',
      output: 'final answer',
      usage: {
        inputTokens: 5,
        outputTokens: 7,
        cacheReadTokens: 6,
        cacheWriteTokens: 7,
        reasoningTokens: 2,
      },
    })
    expect(observed.map(current => current.seq)).toEqual([2, 3, 4, 5, 6, 7, 8])
    expect(harness.whenIdle).toHaveBeenCalledTimes(2)
    expect(harness.flush).toHaveBeenCalledWith(harness.session)
    expect(harness.disposeListener).toHaveBeenCalledOnce()
  })

  it('omits usage when the interval records none', async () => {
    const harness = turnHarness()
    harness.setFollowup((message) => {
      harness.emit(harness.session, {
        type: 'agent/inbox/spliced', seq: 0, time: 0, data: { inserted: [message] },
      })
    })

    await expect(runFixtureTurn(harness.ctx, { task: 'no model step' })).resolves.toEqual({
      type: 'result',
      sessionId: 'fixture-session',
      output: '',
    })
  })

  it('always removes its listener when the turn fails', async () => {
    const harness = turnHarness()
    harness.whenIdle.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('turn failed'))

    await expect(runFixtureTurn(harness.ctx, { task: 'fail' })).rejects.toThrow('turn failed')
    expect(harness.disposeListener).toHaveBeenCalledOnce()
    expect(harness.flush).not.toHaveBeenCalled()
  })
})

describe('runFixtureTurn settlement join', () => {
  /** Deliver the task receipt so the run owns a real interval before settling. */
  const deliverTask = (harness: ReturnType<typeof turnHarness>): void => {
    harness.setFollowup((message) => {
      harness.emit(harness.session, {
        type: 'agent/inbox/spliced', seq: 0, time: 0, data: { inserted: [message] },
      })
    })
  }

  it('skips the join without a subagent service and disposes only the event listener', async () => {
    const harness = turnHarness()
    deliverTask(harness)

    await expect(runFixtureTurn(harness.ctx, { task: 'no settlement service' })).resolves.toMatchObject({
      type: 'result', sessionId: 'fixture-session', output: '',
    })
    expect(harness.disposeListener).toHaveBeenCalledOnce()
    expect(harness.disposeSubagentStart).not.toHaveBeenCalled()
    expect(harness.whenIdle).toHaveBeenCalledTimes(2)
    expect(harness.flush).toHaveBeenCalledWith(harness.session)
  })

  it('awaits stopped children and drains the notice wake to quiescence', async () => {
    const settlement = settlementFake()
    settlement.flushSettlementNotices
      .mockResolvedValueOnce({ woke: true, queued: 1, unread: 0 })
      .mockResolvedValueOnce({ woke: false, queued: 0, unread: 0 })
    const harness = turnHarness({ settlement })
    deliverTask(harness)
    harness.setFollowup((message) => {
      harness.emitSubagentStart({ id: 'child-1' })
      harness.emit(harness.session, {
        type: 'agent/inbox/spliced', seq: 0, time: 0, data: { inserted: [message] },
      })
    })

    await expect(runFixtureTurn(harness.ctx, { task: 'settle child' })).resolves.toMatchObject({ type: 'result' })
    expect(settlement.awaitStopped).toHaveBeenCalledWith('child-1')
    expect(settlement.flushSettlementNotices).toHaveBeenCalledTimes(2)
    // Initial idle, the task turn, and the notice-driven wake.
    expect(harness.whenIdle).toHaveBeenCalledTimes(3)
    expect(harness.disposeListener).toHaveBeenCalledOnce()
    expect(harness.disposeSubagentStart).toHaveBeenCalledOnce()
  })

  it('continues the join when a child never publishes settlement', async () => {
    const settlement = settlementFake()
    settlement.awaitStopped.mockRejectedValueOnce(new Error('child never settled'))
    settlement.flushSettlementNotices.mockResolvedValueOnce({ woke: false, queued: 0, unread: 0, stopped: 'deadline' })
    const harness = turnHarness({ settlement })
    deliverTask(harness)
    harness.setFollowup((message) => {
      harness.emitSubagentStart({ id: 'child-gone' })
      harness.emit(harness.session, {
        type: 'agent/inbox/spliced', seq: 0, time: 0, data: { inserted: [message] },
      })
    })

    await expect(runFixtureTurn(harness.ctx, { task: 'unsettled child' })).resolves.toMatchObject({ type: 'result' })
    expect(settlement.awaitStopped).toHaveBeenCalledWith('child-gone')
    expect(settlement.flushSettlementNotices).toHaveBeenCalledOnce()
    expect(harness.whenIdle).toHaveBeenCalledTimes(2)
  })

  it('keeps joining a quiescent non-idle parent, then returns on an unread queue', async () => {
    const settlement = settlementFake()
    settlement.flushSettlementNotices
      .mockResolvedValueOnce({ woke: false, queued: 0, unread: 0 })
      .mockResolvedValueOnce({ woke: false, queued: 0, unread: 2 })
    const harness = turnHarness({ settlement })
    harness.agent.status = 'running'
    deliverTask(harness)

    await expect(runFixtureTurn(harness.ctx, { task: 'unread notices' })).resolves.toMatchObject({ type: 'result' })
    expect(settlement.flushSettlementNotices).toHaveBeenCalledTimes(2)
    expect(harness.whenIdle).toHaveBeenCalledTimes(2)
  })

  it('stops the join once the settlement deadline is exhausted between passes', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(0)
      const settlement = settlementFake()
      settlement.flushSettlementNotices.mockImplementationOnce(async () => {
        // The pass consumed the whole join budget; the next iteration must not flush.
        vi.setSystemTime(11_000)
        return { woke: true, queued: 1, unread: 0 }
      })
      const harness = turnHarness({ settlement })
      deliverTask(harness)

      await expect(runFixtureTurn(harness.ctx, { task: 'deadline bound' })).resolves.toMatchObject({ type: 'result' })
      expect(settlement.flushSettlementNotices).toHaveBeenCalledOnce()
      expect(harness.whenIdle).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops after the turn bound and drains the final wake', async () => {
    const settlement = settlementFake()
    settlement.flushSettlementNotices.mockResolvedValue({ woke: true, queued: 1, unread: 0 })
    const harness = turnHarness({ settlement })
    harness.agent.status = 'running'
    deliverTask(harness)

    await expect(runFixtureTurn(harness.ctx, { task: 'turn bound' })).resolves.toMatchObject({ type: 'result' })
    // Eight bound turns, each awaiting its wake, then one final idle drain.
    expect(settlement.flushSettlementNotices).toHaveBeenCalledTimes(8)
    expect(harness.whenIdle).toHaveBeenCalledTimes(2 + 8 + 1)
  })
})
