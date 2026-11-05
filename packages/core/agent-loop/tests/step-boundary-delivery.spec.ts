import { describe, expect, it } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import LlmRuntime, { createUserMessage, LlmAdapter } from '@qilin-agent/llm'
import type { ContextFormed, GenerateOptions, StreamChunk, UserMessage } from '@qilin-agent/llm'
import SessionStore, { SessionId } from '@qilin-agent/session'
import SystemPrompt from '@qilin-agent/system-prompt'
import ToolRuntime from '@qilin-agent/tools'
import AgentRegistry, { deliverAtNextStep } from '@qilin-agent/agent'
import type { Agent, StepBoundaryDelivery } from '@qilin-agent/agent'

import AgentLoop from '@qilin-agent/agent-loop'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import { MockAdapter, textResponse } from './mock-adapter.ts'

declare module '@qilin-agent/llm' {
  interface MessageSourceMap {
    'boundary-test': { kind: 'boundary-test' } & ContextFormed
  }
}

/**
 * Adapter that reports when a model call starts and holds it until the test
 * releases the gate, so the test controls exactly which step window a delivery
 * observes.
 */
class GateAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  /** Resolves when the first model call begins streaming. */
  readonly firstCallStarted = Promise.withResolvers<undefined>()
  private readonly gate: Promise<void>

  constructor(gate: Promise<void>) {
    super()
    this.gate = gate
  }

  override resolveModel(provider: string, model: string): Promise<{ provider: string; id: string; name: string }> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.requests.length === 1) {
      this.firstCallStarted.resolve(undefined)
      await this.gate
      yield* textResponse('first step')
      return
    }
    yield* textResponse('second step')
  }
}

async function harness(adapter: LlmAdapter): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function steering(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'boundary-test' } })
}

/** Stage one message through the host hook the shipped loop implements. */
function stage(agent: Agent, message: UserMessage): void {
  (agent as Agent & StepBoundaryDelivery)[deliverAtNextStep](message)
}

describe('step-boundary delivery', () => {
  it('records staged steering at the boundary that claims it', async () => {
    const gate = Promise.withResolvers<undefined>()
    const adapter = new GateAdapter(gate.promise)
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('boundary-running'), {
      provider: 'mock',
      model: 'mock',
    })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'start' }], source: { kind: 'user' } }))
    await adapter.firstCallStarted.promise

    const staged = steering('staged steering')
    stage(agent, staged)
    // The open step cannot record it: it belongs to the next claim.
    expect(agent.session.snapshotEvents().some(event => event.type === 'agent/inbox/spliced'
      && event.data.inserted.some(message => message.id === staged.id))).toBe(false)

    gate.resolve(undefined)
    await agent.whenIdle()

    const events = agent.session.snapshotEvents()
    const insertedAt = events.findIndex(event => event.type === 'agent/inbox/spliced'
      && event.data.inserted.some(message => message.id === staged.id))
    const claimedAt = events.findIndex((event, index) => index > insertedAt
      && event.type === 'agent/inbox/spliced' && event.data.inserted.length === 0)
    const stepStartAt = events.findIndex((event, index) => index > claimedAt && event.type === 'step/start')
    const admittedAt = events.findIndex(event => event.type === 'user/message' && event.data.id === staged.id)
    expect(events[insertedAt - 1]?.type).toBe('step/end')
    expect(claimedAt).toBeGreaterThan(insertedAt)
    expect(stepStartAt).toBeGreaterThan(claimedAt)
    expect(admittedAt).toBeGreaterThan(stepStartAt)
    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests[1]?.messages.at(-1)).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'staged steering' }],
    })
  })

  it('wakes an idle agent and records staged steering before the claim that consumes it', async () => {
    const adapter = new MockAdapter([textResponse('answer')])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('boundary-idle'), {
      provider: 'mock',
      model: 'mock',
    })

    const staged = steering('idle steering')
    stage(agent, staged)
    await agent.whenIdle()

    const events = agent.session.snapshotEvents()
    expect(events[0]).toMatchObject({ type: 'turn/start' })
    const insertedAt = events.findIndex(event => event.type === 'agent/inbox/spliced'
      && event.data.inserted.some(message => message.id === staged.id))
    const claimedAt = events.findIndex((event, index) => index > insertedAt
      && event.type === 'agent/inbox/spliced' && event.data.inserted.length === 0)
    const stepStartAt = events.findIndex((event, index) => index > claimedAt && event.type === 'step/start')
    const admittedAt = events.findIndex(event => event.type === 'user/message' && event.data.id === staged.id)
    expect(insertedAt).toBe(1)
    expect(claimedAt).toBe(2)
    expect(stepStartAt).toBeGreaterThan(claimedAt)
    expect(admittedAt).toBeGreaterThan(stepStartAt)
  })

  it('delivers steering accepted during maintenance after the task settles', async () => {
    const adapter = new MockAdapter([textResponse('answer')])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('boundary-maintenance'), {
      provider: 'mock',
      model: 'mock',
    })

    const staged = steering('maintenance steering')
    await agent.runMaintenance(async () => {
      stage(agent, staged)
    })
    await agent.whenIdle()

    const events = agent.session.snapshotEvents()
    expect(events[0]).toMatchObject({ type: 'agent/inbox/spliced' })
    expect(events[0]).toMatchObject({
      type: 'agent/inbox/spliced',
      data: { inserted: [expect.objectContaining({ id: staged.id })] },
    })
    expect(events.some(event => event.type === 'user/message' && event.data.id === staged.id)).toBe(true)
  })
})
