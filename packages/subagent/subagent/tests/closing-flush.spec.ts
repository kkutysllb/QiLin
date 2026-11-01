/**
 * A closing host flushes the settlement notices its parent still owes: one bounded
 * pass, one closure turn, and an explicit report of what stayed unread.
 */

import { mountWorkingDirectoryFixture } from './working-directory-fixture.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@qilin-agent/kylin'
import type { Agent } from '@qilin-agent/agent'
import AgentLoop from '@qilin-agent/agent-loop'
import { mountAgentLoopTestDependencies } from '@qilin-agent/agent-loop-testkit'
import { LlmAdapter, createUserMessage } from '@qilin-agent/llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@qilin-agent/llm'
import { SessionId } from '@qilin-agent/session'
import JsonlSessionPersistence from '@qilin-agent/session-persistence-jsonl'
import SubagentRuntime from '../src/index.ts'
import { textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { TestSessionQuery } from './test-session-query.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Model adapter that holds one session's stream until its gate resolves. */
class GatedAdapter extends LlmAdapter {
  private readonly gates = new Map<string, Promise<void>>()
  /** Hold the named session's next stream until the returned resolver runs. */
  hold(sessionId: SessionId): () => void {
    const gate = Promise.withResolvers<undefined>()
    this.gates.set(sessionId, gate.promise)
    return () => { gate.resolve(undefined) }
  }
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const gate = options.sessionId === undefined ? undefined : this.gates.get(options.sessionId)
    if (gate !== undefined) {
      await Promise.race([
        gate,
        new Promise<void>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
        }),
      ])
    }
    yield* textResponse('answer ' + String(options.sessionId))
  }
}

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const root = mkdtempSync(join(tmpdir(), 'qilin-closing-flush-'))
  roots.push(root)
  await ctx.plugin(JsonlSessionPersistence, { root })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(TestSessionQuery)
  await mountWorkingDirectoryFixture(ctx)
  await ctx.plugin(SubagentRuntime)
  const adapter = new GatedAdapter()
  ctx.llm.registerAdapter(['mock'], adapter)
  ctx.subagents.registerProvider({
    name: 'gated',
    capabilities: { agentOptions: true, outputSchema: true, depthLimit: true, toolFilter: true, persona: true },
    inheritsParentContext: false,
    prepareContinuable: () => Promise.resolve({}),
  })
  const parent: Agent = await ctx.agentLoop.create(SessionId('parent'), { provider: 'mock', model: 'mock' })
  return { ctx, parent, adapter }
}

/** Start one continuable child through the managed API. */
function start(ctx: Context, parent: Agent, childId: string) {
  return ctx.subagents.startActivation({
    provider: 'gated',
    childId: SessionId(childId),
    label: childId,
    request: { prompt: [{ type: 'text' as const, text: childId }], parent },
    signal: new AbortController().signal,
    delivery: 'parent',
  })
}

/** Settlement notices the model already read, in claimed order. */
function readNoticeSenders(parent: Agent): string[] {
  return parent.session.snapshotEvents()
    .flatMap(event => event.type === 'user/message' ? [event.data] : [])
    .flatMap(message => message.source.kind === 'subagent-settled' ? [String(message.source.senderSessionId)] : [])
}

/** Settlement notices still queued for a later turn. */
function queuedNoticeSenders(parent: Agent): string[] {
  return [...parent.inbox.nextStep, ...parent.inbox.nextTurn]
    .flatMap(message => message.source.kind === 'subagent-settled' ? [String(message.source.senderSessionId)] : [])
}

function turnStarts(parent: Agent): number {
  return parent.session.snapshotEvents().filter(event => event.type === 'turn/start').length
}

/** Drive one parent turn to completion while a child is still running. */
async function driveTurnWhileChildRuns(
  ctx: Context,
  parent: Agent,
  adapter: GatedAdapter,
  childId: string,
): Promise<void> {
  const releaseParent = adapter.hold(parent.session.id)
  await start(ctx, parent, childId)
  parent.followup(createUserMessage({ content: [{ type: 'text', text: 'work' }], source: { kind: 'user' } }))
  await vi.waitFor(() => { expect(parent.status).toBe('running') }, { timeout: 15_000 })
  // The child settles mid-turn, so its notice is held for the turn boundary and queued.
  await vi.waitFor(() => { expect(ctx.agents.get(SessionId(childId))).toBeUndefined() }, { timeout: 15_000 })
  releaseParent()
  await parent.whenIdle()
  await vi.waitFor(() => { expect(queuedNoticeSenders(parent)).toEqual([childId]) }, { timeout: 15_000 })
}

describe('closing settlement flush', () => {
  it('reads a notice queued at the parent turn boundary in one closure turn', { timeout: 30_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    await driveTurnWhileChildRuns(ctx, parent, adapter, 'child-a')
    const before = turnStarts(parent)
    const report = await ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 10_000 })
    expect(report).toEqual({ woke: true, queued: 1, unread: 0 })
    expect(turnStarts(parent)).toBe(before + 1)
    expect(readNoticeSenders(parent)).toEqual(['child-a'])
  })

  it('returns without a turn when nothing is queued', { timeout: 30_000 }, async () => {
    const { ctx, parent } = await setup()
    const before = turnStarts(parent)
    const report = await ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 10_000 })
    expect(report).toEqual({ woke: false, queued: 0, unread: 0 })
    expect(turnStarts(parent)).toBe(before)
  })

  it('batches a notice that settles during the closing join into the same closure turn', { timeout: 30_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    const releaseChild = adapter.hold(SessionId('child-b'))
    await start(ctx, parent, 'child-b')
    const before = turnStarts(parent)
    const flushing = ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 10_000 })
    releaseChild()
    const report = await flushing
    expect(report).toEqual({ woke: true, queued: 1, unread: 0 })
    expect(turnStarts(parent)).toBe(before + 1)
    expect(readNoticeSenders(parent)).toEqual(['child-b'])
  })

  it('shares one closure pass between concurrent callers', { timeout: 30_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    await driveTurnWhileChildRuns(ctx, parent, adapter, 'child-c')
    const before = turnStarts(parent)
    const first = ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 10_000 })
    const second = ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 10_000 })
    const [left, right] = await Promise.all([first, second])
    expect(left).toEqual({ woke: true, queued: 1, unread: 0 })
    expect(right).toEqual(left)
    expect(turnStarts(parent)).toBe(before + 1)
  })

  it('reports the batch as unread when the deadline ends the closure turn', { timeout: 30_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    await driveTurnWhileChildRuns(ctx, parent, adapter, 'child-d')
    const releaseClosure = adapter.hold(parent.session.id)
    const report = await ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 100 })
    expect(report).toEqual({ woke: true, queued: 1, unread: 1, stopped: 'deadline' })
    releaseClosure()
    await parent.whenIdle()
  })

  it('stops on caller cancellation and reports the queue it left', { timeout: 30_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    await driveTurnWhileChildRuns(ctx, parent, adapter, 'child-e')
    const controller = new AbortController()
    controller.abort(new Error('test cancellation'))
    const report = await ctx.subagents.flushSettlementNotices(parent, {
      deadlineMs: 10_000,
      signal: controller.signal,
    })
    expect(report).toEqual({ woke: false, queued: 0, unread: 1, stopped: 'cancelled' })
    expect(readNoticeSenders(parent)).toEqual([])
  })

  it('reports a deadline that expires while the parent is still mid-turn', { timeout: 30_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    const releaseTurn = adapter.hold(parent.session.id)
    parent.followup(createUserMessage({ content: [{ type: 'text', text: 'work' }], source: { kind: 'user' } }))
    await vi.waitFor(() => { expect(parent.status).toBe('running') }, { timeout: 15_000 })
    const report = await ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 50 })
    expect(report).toEqual({ woke: false, queued: 0, unread: 0, stopped: 'deadline' })
    releaseTurn()
    await parent.whenIdle()
  })

  it('reports a deadline that expires while a descendant still runs', { timeout: 30_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    const releaseChild = adapter.hold(SessionId('child-f'))
    await start(ctx, parent, 'child-f')
    const report = await ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 50 })
    expect(report).toEqual({ woke: false, queued: 0, unread: 0, stopped: 'deadline' })
    releaseChild()
    await vi.waitFor(() => { expect(ctx.agents.get(SessionId('child-f'))).toBeUndefined() }, { timeout: 15_000 })
  })

  it('keeps a held notice durable when the deadline ends the flush', { timeout: 30_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    const releaseTurn = adapter.hold(parent.session.id)
    const releaseChild = adapter.hold(SessionId('child-h'))
    await start(ctx, parent, 'child-h')
    const flushing = ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 200 })
    releaseChild()
    const report = await flushing
    expect(report).toEqual({ woke: true, queued: 1, unread: 1, stopped: 'deadline' })
    // The closure published the notice into the parent's log before it gave up.
    expect(readNoticeSenders(parent)).toEqual(['child-h'])
    releaseTurn()
    await parent.whenIdle()
  })

  it('publishes a notice held during the opening idle wait', { timeout: 30_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    const releaseTurn = adapter.hold(parent.session.id)
    parent.followup(createUserMessage({ content: [{ type: 'text', text: 'work' }], source: { kind: 'user' } }))
    await vi.waitFor(() => { expect(parent.status).toBe('running') }, { timeout: 15_000 })
    // The child settles while the parent's own turn still runs, so the closure holds it.
    await start(ctx, parent, 'child-i')
    const report = await ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 150 })
    expect(report).toEqual({ woke: false, queued: 0, unread: 1, stopped: 'deadline' })
    // The held notice is durable before the flush gives up, so a later run still reads it.
    expect(queuedNoticeSenders(parent)).toEqual(['child-i'])
    releaseTurn()
    await parent.whenIdle()
  })

  it('stops on cancellation that arrives during the join', { timeout: 30_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    const releaseChild = adapter.hold(SessionId('child-k'))
    await start(ctx, parent, 'child-k')
    const controller = new AbortController()
    const flushing = ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 10_000, signal: controller.signal })
    controller.abort(new Error('cancelled mid-flush'))
    await expect(flushing).resolves.toEqual({ woke: false, queued: 0, unread: 0, stopped: 'cancelled' })
    releaseChild()
    await vi.waitFor(() => { expect(ctx.agents.get(SessionId('child-k'))).toBeUndefined() }, { timeout: 15_000 })
  })

  it('rejects a deadline a timer cannot honour', { timeout: 30_000 }, async () => {
    const { ctx, parent } = await setup()
    await expect(ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 0 })).rejects.toThrow(TypeError)
    await expect(ctx.subagents.flushSettlementNotices(parent, { deadlineMs: 1.5 })).rejects.toThrow(TypeError)
  })
})
