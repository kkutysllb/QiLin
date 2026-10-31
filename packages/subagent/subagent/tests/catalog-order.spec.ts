/**
 * Concurrent delegation catalog order: accepted identities publish parent catalog
 * rows in acceptance order even when their materialization completes in reverse.
 */

import { mountWorkingDirectoryFixture } from './working-directory-fixture.ts'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@qilin-agent/kylin'
import type { Agent } from '@qilin-agent/agent'
import AgentLoop from '@qilin-agent/agent-loop'
import { mountAgentLoopTestDependencies } from '@qilin-agent/agent-loop-testkit'
import { SessionId } from '@qilin-agent/session'
import type { SessionEvent } from '@qilin-agent/session'
import JsonlSessionPersistence from '@qilin-agent/session-persistence-jsonl'
import SubagentRuntime from '../src/index.ts'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { TestSessionQuery } from './test-session-query.ts'

const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/**
 * Boot the local activation stack with a provider whose first preparation waits
 * for the second call, so the second child materializes first.
 */
async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const root = mkdtempSync(join(tmpdir(), 'dsh-catalog-order-'))
  roots.push(root)
  await ctx.plugin(JsonlSessionPersistence, { root })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(TestSessionQuery)
  await mountWorkingDirectoryFixture(ctx)
  await ctx.plugin(SubagentRuntime)
  ctx.llm.registerAdapter(['mock'], new MockAdapter([textResponse('first done'), textResponse('second done')]))
  let preparations = 0
  const releaseFirst = { resolve: () => {} }
  const firstGate = new Promise<void>((resolve) => { releaseFirst.resolve = resolve })
  ctx.subagents.registerProvider({
    name: 'ordered',
    capabilities: { agentOptions: true, outputSchema: true, depthLimit: true, toolFilter: true, persona: true },
    inheritsParentContext: false,
    prepareContinuable: () => {
      preparations += 1
      if (preparations === 1) return firstGate.then(() => ({}))
      releaseFirst.resolve()
      return Promise.resolve({})
    },
  })
  const parent: Agent = await ctx.agentLoop.create(SessionId('parent'), { provider: 'mock', model: 'mock' })
  return { ctx, parent }
}

function start(ctx: Context, parent: Agent, childId: string) {
  return ctx.subagents.startActivation({
    provider: 'ordered',
    childId: SessionId(childId),
    label: childId,
    request: { prompt: [{ type: 'text' as const, text: childId }], parent },
    signal: new AbortController().signal,
    delivery: 'parent',
  })
}

function catalogChildIds(events: readonly SessionEvent[]): string[] {
  return events
    .filter(event => event.type === 'subagent/catalog')
    .map(event => String(event.data.childId))
}

describe('concurrent catalog order', () => {
  it('records accepted identities in acceptance order when materialization reverses', { timeout: 20_000 }, async () => {
    const { ctx, parent } = await setup()
    // Accept child-a first, then child-b; child-b's preparation releases child-a's,
    // so child-b materializes first and child-a appends last.
    const first = start(ctx, parent, 'child-a')
    const second = start(ctx, parent, 'child-b')
    const [a, b] = await Promise.all([first, second])
    expect(a.childId).toBe(SessionId('child-a'))
    expect(b.childId).toBe(SessionId('child-b'))
    expect(catalogChildIds(parent.session.snapshotEvents())).toEqual(['child-a', 'child-b'])
    const events = parent.session.snapshotEvents().filter(event => event.type === 'subagent/catalog')
    // Each accepted child appends exactly one complete catalog fact.
    expect(events).toHaveLength(2)
    expect(events.map(event => event.data.mode)).toEqual(['continuable', 'continuable'])
    await a.dispose()
    await b.dispose()
  })

  it('keeps acceptance order across a second concurrent pair', { timeout: 20_000 }, async () => {
    const { ctx, parent } = await setup()
    const first = start(ctx, parent, 'child-c')
    const second = start(ctx, parent, 'child-d')
    const [c, d] = await Promise.all([first, second])
    expect(catalogChildIds(parent.session.snapshotEvents())).toEqual(['child-c', 'child-d'])
    await c.dispose()
    await d.dispose()
  })
})
