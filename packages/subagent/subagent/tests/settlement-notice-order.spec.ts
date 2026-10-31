/**
 * Settlement notices leave a parent in acceptance order: a child that settles first waits for
 * every earlier accepted child, so the parent transcript never depends on completion order.
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
import { LlmAdapter } from '@qilin-agent/llm'
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
    yield* textResponse(`answer ${options.sessionId}`)
  }
}

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const root = mkdtempSync(join(tmpdir(), 'dsh-notice-order-'))
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

/** Settlement notices the parent received, in delivery order. */
function noticeSenders(parent: Agent): string[] {
  const logged = parent.session.snapshotEvents().flatMap(event => event.type === 'user/message' ? [event.data] : [])
  return [...logged, ...parent.inbox.nextStep, ...parent.inbox.nextTurn].flatMap(message =>
    message.source.kind === 'subagent-settled' ? [String(message.source.senderSessionId)] : [])
}

async function waitNoActivation(ctx: Context, childId: SessionId): Promise<void> {
  await vi.waitFor(() => { expect(ctx.agents.get(childId)).toBeUndefined() }, { timeout: 15_000 })
}

describe('settlement notice order', () => {
  it('delivers notices in acceptance order when the earlier child settles last', { timeout: 20_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    const releaseFirst = adapter.hold(SessionId('child-a'))
    const a = start(ctx, parent, 'child-a')
    const b = start(ctx, parent, 'child-b')
    await a
    await b
    // The later accepted child finishes first; its notice waits for child-a.
    await waitNoActivation(ctx, SessionId('child-b'))
    expect(noticeSenders(parent)).not.toContain('child-b')
    releaseFirst()
    await waitNoActivation(ctx, SessionId('child-a'))
    await vi.waitFor(() => {
      expect(noticeSenders(parent)).toEqual(['child-a', 'child-b'])
    }, { timeout: 15_000 })
  })

  it('releases a queued notice when the earlier child is disposed before settling', { timeout: 20_000 }, async () => {
    const { ctx, parent, adapter } = await setup()
    const releaseFirst = adapter.hold(SessionId('child-c'))
    const first = start(ctx, parent, 'child-c')
    const second = start(ctx, parent, 'child-d')
    const c = await first
    await second
    await waitNoActivation(ctx, SessionId('child-d'))
    expect(noticeSenders(parent)).not.toContain('child-d')
    // Disposing the earlier child without a natural settlement must not hold the queue.
    await c.dispose()
    await vi.waitFor(() => {
      expect(noticeSenders(parent)).toContain('child-d')
    }, { timeout: 15_000 })
    releaseFirst()
  })
})
