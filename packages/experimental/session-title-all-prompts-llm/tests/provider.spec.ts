import { Context } from '@qilin-agent/kylin'
import { describe, expect, it } from 'vitest'
import LlmRuntime, { createUserMessage, LlmAdapter  } from '@qilin-agent/llm'
import type { GenerateOptions, StreamChunk } from '@qilin-agent/llm'
import SessionStore, { Session, SessionId } from '@qilin-agent/session'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import { turnBoundaryProjectionDefinition } from '@qilin-agent/agent-loop'
import SessionTitleService, { SessionTitleProviderId } from '@qilin-agent/session-title'
import * as providerPlugin from '@qilin-agent/experimental-session-title-all-prompts-llm'

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'text-delta', index: 0, text: 'All messages model title' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const TITLE_CONFIG = { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 } as const
const LLM_CONFIG = {
  targetWords: 5,
  targetCjkCharacters: 10,
  maxInputBytes: 1_000,
  maxOutputTokens: 32,
  timeoutMs: 1_000,
} as const

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('all-messages LLM title provider', () => {
  it('includes seeded history and the latest prompt while inheriting the logged request route', async () => {
    const seeded = Session.create(SessionId('seed-source'))
    seeded.append('turn/start', { turn: 1 })
    const inherited = seeded.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'inherited prompt' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    seeded.append('session/title', {
      title: 'Inherited fallback', messageSeqs: [inherited.seq], source: { kind: 'fallback' },
    })
    seeded.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
    await ctx.plugin(SessionTitleService, TITLE_CONFIG)
    const adapter = new RecordingAdapter()
    ctx.llm.registerAdapter(['current-route'], adapter)
    await ctx.plugin(providerPlugin, LLM_CONFIG)
    const session = ctx.sessions.create(SessionId('all-plugin'), {
      seed: seeded.snapshotEvents(),
      inheritedEventCount: seeded.seq,
      meta: { parentSession: seeded.id, isSeeded: true },
    })
    session.append('turn/start', { turn: 2 })
    const latest = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'latest prompt' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    await settle()
    session.append('request/header', {
      header: { config: { provider: 'current-route', model: 'current-model' } }, reason: 'resume',
    })
    await settle()

    expect(adapter.requests[0]).toMatchObject({ provider: 'current-route', model: 'current-model' })
    const content = adapter.requests[0]?.messages[0]?.content[0]
    expect(content?.type === 'text' && content.text).toContain('inherited prompt')
    expect(content?.type === 'text' && content.text).toContain('latest prompt')
    expect(ctx.sessionTitle.get(session)).toMatchObject({
      messageSeqs: [inherited.seq, latest.seq],
    })
  })

  it('offers a provider-generated current title so an adequate title is preserved', async () => {
    const seeded = Session.create(SessionId('seed-titled'))
    seeded.append('turn/start', { turn: 1 })
    const first = seeded.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'plant the balcony' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    seeded.append('session/title', {
      title: 'Balcony planting', messageSeqs: [first.seq],
      source: { kind: 'provider', provider: SessionTitleProviderId('first-model') },
    })
    seeded.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
    await ctx.plugin(SessionTitleService, TITLE_CONFIG)
    const adapter = new RecordingAdapter()
    ctx.llm.registerAdapter(['current-route'], adapter)
    await ctx.plugin(providerPlugin, LLM_CONFIG)
    const session = ctx.sessions.create(SessionId('all-plugin-titled'), {
      seed: seeded.snapshotEvents(),
      inheritedEventCount: seeded.seq,
      meta: { parentSession: seeded.id, isSeeded: true },
    })
    session.append('turn/start', { turn: 2 })
    const latest = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'thanks, same topic please continue' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    await settle()
    session.append('request/header', {
      header: { config: { provider: 'current-route', model: 'current-model' } }, reason: 'resume',
    })
    await settle()

    const options = adapter.requests[0]!
    const content = options.messages[0]?.content[0]
    if (content?.type !== 'text') throw new Error('expected the framed title input')
    // The existing model title rides as data, so a follow-up cannot silently reword it.
    expect(JSON.parse(content.text.slice(content.text.indexOf('\n') + 1))).toEqual({
      currentTitle: 'Balcony planting',
      messages: [{ seq: first.seq, text: 'plant the balcony' }, { seq: latest.seq, text: 'thanks, same topic please continue' }],
    })
    expect(options.system).toContain('return it exactly unchanged')
  })
})

describe('all-messages provider output and failure handling', () => {
  const TITLE_SCRIPT: StreamChunk[] = [
    { type: 'text-delta', index: 0, text: 'All messages model title' },
    { type: 'finish', reason: { kind: 'stop' } },
  ]

  class ScriptedAdapter extends LlmAdapter {
    readonly requests: GenerateOptions[] = []

    constructor(private readonly script: readonly StreamChunk[] = TITLE_SCRIPT) { super() }

    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      this.requests.push(options)
      yield * this.script
    }
  }

  /** Mount the title service and this provider over one scripted adapter. */
  async function harness(script: readonly StreamChunk[] = TITLE_SCRIPT): Promise<{ ctx: Context; adapter: ScriptedAdapter }> {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
    await ctx.plugin(SessionTitleService, TITLE_CONFIG)
    const adapter = new ScriptedAdapter(script)
    ctx.llm.registerAdapter(['current-route'], adapter)
    await ctx.plugin(providerPlugin, LLM_CONFIG)
    return { ctx, adapter }
  }

  function titled(session: Session): void {
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'name this session' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    session.append('request/header', {
      header: { config: { provider: 'current-route', model: 'current-model' } }, reason: 'initial',
    })
  }

  it.each([
    [['**Continuing Previous', ' Session**\n\nThe only message is "continue".'], 'Continuing Previous Session'],
    [['\n  *Greeting*  \n'], 'Greeting'],
    [['**a** and **b**\nnote'], '**a** and **b**'],
    [['Use **bold** for emphasis'], 'Use **bold** for emphasis'],
    [['Fix *args* handling'], 'Fix *args* handling'],
    [['*args'], '*args'],
    [['****'], '****'],
  ])('takes the title from the first non-empty output line %j', async (deltas, title) => {
    const { ctx } = await harness([
      { type: 'block-start', index: 0, blockType: 'text' },
      ...deltas.map((text): StreamChunk => ({ type: 'text-delta', index: 0, text })),
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    const session = ctx.sessions.create(SessionId('all-parse'))
    titled(session)

    await ctx.sessionTitle.refresh(session)

    expect(ctx.sessionTitle.get(session)?.title).toBe(title)
  })

  it('rejects tool-calls and max-tokens termination even when the blocks carry text', async () => {
    const toolCalls = await harness([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'Title from text' },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
    const toolCallsSession = toolCalls.ctx.sessions.create(SessionId('all-tool-calls-finish'))
    titled(toolCallsSession)
    await expect(toolCalls.ctx.sessionTitle.refresh(toolCallsSession)).rejects.toThrow(/output must contain text only/)

    const maxTokens = await harness([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'Partial title' },
      { type: 'finish', reason: { kind: 'max-tokens' } },
    ])
    const maxTokensSession = maxTokens.ctx.sessions.create(SessionId('all-max-tokens-finish'))
    titled(maxTokensSession)
    await expect(maxTokens.ctx.sessionTitle.refresh(maxTokensSession)).rejects.toThrow(/reached maxOutputTokens/)
  })

  it('rejects a successful response with no text', async () => {
    const { ctx } = await harness([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'no final title' },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    const session = ctx.sessions.create(SessionId('all-reasoning'))
    titled(session)

    await expect(ctx.sessionTitle.refresh(session)).rejects.toThrow(/produced no text/)
  })
})
