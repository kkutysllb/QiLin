import { Context } from '@qilin-agent/kylin'
import { describe, expect, it, vi } from 'vitest'
import LlmRuntime, { createUserMessage, LlmAdapter, ToolCallId } from '@qilin-agent/llm'
import type { GenerateOptions, StreamChunk } from '@qilin-agent/llm'
import SessionStore, { Session, SessionId } from '@qilin-agent/session'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import { turnBoundaryProjectionDefinition } from '@qilin-agent/agent-loop'
import SessionTitleService, { type SessionTitleProvider } from '@qilin-agent/session-title'
import * as providerPlugin from '@qilin-agent/session-title-first-prompt-llm'

const TITLE_SCRIPT: StreamChunk[] = [
  { type: 'text-delta', index: 0, text: 'First-message model title' },
  { type: 'finish', reason: { kind: 'stop' } },
]

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(private readonly script: readonly StreamChunk[] = TITLE_SCRIPT) { super() }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield * this.script
  }
}

/** Mount the service and this provider over one scripted adapter. */
async function harness(script: readonly StreamChunk[] = TITLE_SCRIPT): Promise<{ ctx: Context; adapter: RecordingAdapter }> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
  await ctx.plugin(SessionTitleService, TITLE_CONFIG)
  const adapter = new RecordingAdapter(script)
  ctx.llm.registerAdapter(['title-route'], adapter)
  await ctx.plugin(providerPlugin, LLM_CONFIG)
  return { ctx, adapter }
}

function appendHumanPrompt(session: Session, text: string): { seq: number } {
  session.append('turn/start', { turn: 1 })
  return session.append('user/message', createUserMessage({
    content: [{ type: 'text', text }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
}

const TITLE_CONFIG = { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 } as const
const LLM_CONFIG = {
  targetWords: 5,
  targetCjkCharacters: 10,
  maxInputBytes: 1_000,
  maxOutputTokens: 32,
  timeoutMs: 1_000,
  provider: 'title-route',
  model: 'title-model',
} as const

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('first-prompt LLM title provider', () => {
  it('rejects an impossible empty provider request at its own boundary', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
    await ctx.plugin(SessionTitleService, TITLE_CONFIG)
    let registered: SessionTitleProvider | undefined
    vi.spyOn(ctx.sessionTitle, 'register').mockImplementation((provider) => {
      registered = provider
      return async () => undefined
    })
    providerPlugin.apply(ctx, LLM_CONFIG)

    await expect(registered!.generate({
      session: Session.create(SessionId('empty-first-provider')),
      messages: [],
      signal: new AbortController().signal,
    })).rejects.toThrow(/requires one human message/)
  })

  it('always selects only the first eligible human message, including explicit refresh', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
    await ctx.plugin(SessionTitleService, TITLE_CONFIG)
    const adapter = new RecordingAdapter()
    ctx.llm.registerAdapter(['title-route'], adapter)
    await ctx.plugin(providerPlugin, LLM_CONFIG)
    const session = ctx.sessions.create(SessionId('first-plugin'))
    session.append('turn/start', { turn: 1 })
    const first = session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'first input' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    await settle()
    session.append('request/header', {
      header: { config: { provider: 'main', model: 'main-model' } }, reason: 'initial',
    })
    await settle()
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'second input must be ignored' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })

    await ctx.sessionTitle.refresh(session)

    expect(adapter.requests).toHaveLength(2)
    for (const options of adapter.requests) {
      const content = options.messages[0]?.content[0]
      expect(content?.type === 'text' && content.text).toContain('first input')
      expect(content?.type === 'text' && content.text).not.toContain('second input must be ignored')
      // The first-prompt cadence never carries a current title: it names the
      // session, and the all-prompts cadence owns preserving that name.
      expect(content?.type === 'text' && content.text).not.toContain('currentTitle')
      expect(options.system).not.toContain('return it exactly unchanged')
    }
    expect(ctx.sessionTitle.get(session)).toMatchObject({ messageSeqs: [first.seq] })
  })

  it('frames the first message as data and records the exact system and input', async () => {
    const { ctx, adapter } = await harness()
    const session = ctx.sessions.create(SessionId('first-logging'))
    const first = appendHumanPrompt(session, 'Room "quote" and 番茄')

    await ctx.sessionTitle.refresh(session)

    const options = adapter.requests[0]!
    const prompt = options.messages[0]?.content[0]
    const system = [
      'Create a concise title for an AI coding-assistant session from the supplied human messages.',
      'Return only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.',
      'Use the language of the messages.',
      'Aim for about 5 words in non-CJK languages or 10 CJK characters.',
      'If the messages give little to name, still return a short best-effort title, such as Greeting, instead of explaining.',
    ].join('\n')
    expect(prompt?.type === 'text' && prompt.text).toBe(
      `Generate the session title from this JSON array of human messages:\n${JSON.stringify([
        { seq: first.seq, text: 'Room "quote" and 番茄' },
      ])}`,
    )
    expect(options.system).toBe(system)
    expect(session.snapshotEvents().findLast(event => event.type === 'session/title-llm-request')?.data)
      .toEqual({
        titleProvider: providerPlugin.name,
        messageSeqs: [first.seq],
        route: { provider: 'title-route', model: 'title-model' },
        system,
        messages: options.messages,
        maxTokens: 32,
      })
  })

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
    const session = ctx.sessions.create(SessionId('first-parse'))
    appendHumanPrompt(session, 'first input')

    await ctx.sessionTitle.refresh(session)

    expect(ctx.sessionTitle.get(session)?.title).toBe(title)
  })

  it('rejects tool-calls and max-tokens termination even when the blocks carry text', async () => {
    const toolCalls = await harness([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'Title from text' },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
    const toolCallsSession = toolCalls.ctx.sessions.create(SessionId('first-tool-calls-finish'))
    appendHumanPrompt(toolCallsSession, 'first input')
    await expect(toolCalls.ctx.sessionTitle.refresh(toolCallsSession)).rejects.toThrow(/output must contain text only/)

    const maxTokens = await harness([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'Partial title' },
      { type: 'finish', reason: { kind: 'max-tokens' } },
    ])
    const maxTokensSession = maxTokens.ctx.sessions.create(SessionId('first-max-tokens-finish'))
    appendHumanPrompt(maxTokensSession, 'first input')
    await expect(maxTokens.ctx.sessionTitle.refresh(maxTokensSession)).rejects.toThrow(/reached maxOutputTokens/)
  })

  it('rejects tool-call blocks and a successful response with no text', async () => {
    const tool = await harness([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: ToolCallId('title-tool'), name: 'unexpected', argumentsDelta: '{}' },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    const toolSession = tool.ctx.sessions.create(SessionId('first-tool'))
    appendHumanPrompt(toolSession, 'first input')
    await expect(tool.ctx.sessionTitle.refresh(toolSession)).rejects.toThrow(/output must contain text only/)

    const reasoning = await harness([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'no final title' },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
    const reasoningSession = reasoning.ctx.sessions.create(SessionId('first-reasoning'))
    appendHumanPrompt(reasoningSession, 'first input')
    await expect(reasoning.ctx.sessionTitle.refresh(reasoningSession)).rejects.toThrow(/produced no text/)
  })

})
