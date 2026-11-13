import { describe, expect, it } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import AgentRegistry from '@qilin-agent/agent'
import AgentLoop from '@qilin-agent/agent-loop'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import LlmRuntime, { createUserMessage, LlmError } from '@qilin-agent/llm'
import SessionStore, { SessionId } from '@qilin-agent/session'
import SystemPrompt from '@qilin-agent/system-prompt'
import ToolRuntime from '@qilin-agent/tools'
import { MockAdapter, textResponse } from './mock-adapter.ts'

async function harness(adapter: MockAdapter): Promise<Context> {
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

function fail(message: string, code: string): () => never {
  return () => {
    throw new LlmError(message, code)
  }
}

function human(text: string) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

describe('agent retry', () => {
  it('re-runs the last ended turn over the existing surface without new input', async () => {
    const adapter = new MockAdapter([fail('busy', 'RATE_LIMIT'), textResponse('retried answer')])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('retry-turn'), { provider: 'mock', model: 'mock' })

    agent.followup(human('go'))
    await agent.whenIdle()

    const failed = agent.session.snapshotEvents()
    expect(failed.filter(event => event.type === 'turn/end').at(-1)?.data)
      .toMatchObject({ turn: 1, reason: { kind: 'error' } })

    agent.retry(1)
    await agent.whenIdle()

    const events = agent.session.snapshotEvents()
    expect(events.find(event => event.type === 'turn/retry')?.data).toEqual({ turn: 2, retriedTurn: 1 })
    // The retry admits no message: the surface keeps exactly one human input.
    expect(events.filter(event => event.type === 'user/message'
      && (event.data as { source: { kind: string } }).source.kind === 'user')).toHaveLength(1)
    expect(events.filter(event => event.type === 'turn/start').map(event => event.data)).toEqual([{ turn: 1 }, { turn: 2 }])
    expect(events.filter(event => event.type === 'turn/end').at(-1)?.data)
      .toMatchObject({ turn: 2, reason: { kind: 'completed' } })
    expect(adapter.requests).toHaveLength(2)
    // The second request replays the same conversation, not a duplicate prompt.
    expect(adapter.requests[1]?.messages.filter(message => message.role === 'user')).toHaveLength(
      adapter.requests[0]?.messages.filter(message => message.role === 'user').length ?? -1,
    )
    await ctx.fiber.dispose()
  })

  it('refuses a retry that does not name the last ended turn', async () => {
    const adapter = new MockAdapter([textResponse('done')])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('retry-turn-guard'), { provider: 'mock', model: 'mock' })

    expect(() => { agent.retry(1) }).toThrow('must name the last ended turn 0')

    agent.followup(human('go'))
    await agent.whenIdle()

    expect(() => { agent.retry(0) }).toThrow('must name the last ended turn 1')
    await ctx.fiber.dispose()
  })

  it('refuses a retry while another activity runs', async () => {
    const adapter = new MockAdapter(['hang'])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('retry-turn-busy'), { provider: 'mock', model: 'mock' })

    agent.followup(human('go'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(() => { agent.retry(0) }).toThrow('requires an idle agent')
    agent.cancel({ kind: 'user' })
    await agent.whenIdle()
    await ctx.fiber.dispose()
  })
})
