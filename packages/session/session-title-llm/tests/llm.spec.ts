import { Context } from '@qilin-agent/kylin'
import { describe, expect, it } from 'vitest'
import LlmRuntime, { createUserMessage, LlmAdapter, ReasoningEffortId } from '@qilin-agent/llm'
import type { LlmResolvedModelInfo } from '@qilin-agent/llm'
import { MAX_TIMER_DELAY_MS } from '@qilin-agent/timeout'
import type { GenerateOptions, StreamChunk } from '@qilin-agent/llm'
import SessionStore, { SessionId } from '@qilin-agent/session'
import { SessionTitleProviderId } from '@qilin-agent/session-title'
import type { SessionTitleProviderRequest } from '@qilin-agent/session-title'
import {
  executeSessionTitleLlm,
  resolveSessionTitleLlmConfig,
  terminalFinish,
  type SessionTitleLlmConfig,
} from '@qilin-agent/session-title-llm'

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  constructor(
    private readonly script: readonly StreamChunk[],
    private readonly onDispatch?: () => void,
  ) {
    super()
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.onDispatch?.()
    this.requests.push(options)
    yield * this.script
  }
}



/** A scripted adapter that also declares one default reasoning effort for its route. */
class ReasoningAdapter extends RecordingAdapter {
  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      reasoning: {
        efforts: [{ id: ReasoningEffortId('standard'), name: 'Standard' }],
        defaultEffort: ReasoningEffortId('standard'),
      },
    })
  }
}

const SCRIPT: StreamChunk[] = [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text: '  五个字标题  ' },
  { type: 'finish', reason: { kind: 'stop' } },
]

const CONFIG = {
  maxInputBytes: 1_000,
  maxOutputTokens: 32,
  timeoutMs: 1_000,
} as const

const TITLE_PROVIDER = SessionTitleProviderId('test-title-provider')
let nextSession = 0

function request(ctx: Context, signal = new AbortController().signal): SessionTitleProviderRequest {
  const session = ctx.sessions.create(SessionId(`title-call-${++nextSession}`))
  session.append('turn/start', {
    turn: 1,
  })
  const first = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'first prompt' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  const second = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: '第二个问题' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return {
    session,
    messages: [
      { seq: first.seq, text: 'first prompt' },
      { seq: second.seq, text: '第二个问题' },
    ],
    route: { provider: 'current-route', model: 'current-model' },
    signal,
  }
}


async function withScript(script: readonly StreamChunk[]): Promise<{
  ctx: Context
  adapter: RecordingAdapter
}> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(LlmRuntime)
  const adapter = new RecordingAdapter(script)
  ctx.llm.registerAdapter(['current-route'], adapter)
  return { ctx, adapter }
}

describe('executeSessionTitleLlm', () => {
  it('owns route preparation, the request record, and stream assembly for a prepared request', async () => {
    const { ctx, adapter } = await withScript(SCRIPT)
    const providerRequest = request(ctx)
    const response = await executeSessionTitleLlm(ctx, resolveSessionTitleLlmConfig(CONFIG), providerRequest, TITLE_PROVIDER, {
      system: 'Provider system prompt.',
      input: 'Provider input.',
      messageSeqs: [providerRequest.messages[0]!.seq],
      selectReasoningEffort: () => undefined,
    })

    expect(response.finish).toEqual({ kind: 'stop' })
    expect(response.model).toEqual({ provider: 'current-route', model: 'current-model' })
    expect(response.blocks).toEqual([{ type: 'text', text: '  五个字标题  ' }])
    expect(adapter.requests[0]).toMatchObject({
      system: 'Provider system prompt.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Provider input.' }] }],
      maxTokens: CONFIG.maxOutputTokens,
    })
    expect(providerRequest.session.snapshotEvents().at(-1)).toMatchObject({
      type: 'session/title-llm-request',
      data: {
        titleProvider: TITLE_PROVIDER,
        messageSeqs: [providerRequest.messages[0]!.seq],
        system: 'Provider system prompt.',
        maxTokens: CONFIG.maxOutputTokens,
      },
    })
  })

  it('applies the provider reasoning selection during route preparation', async () => {
    const { ctx, adapter } = await withScript(SCRIPT)
    const providerRequest = request(ctx)

    // The selection reaches prepareCall; a route that does not offer the
    // effort refuses it before dispatch instead of streaming it anyway.
    await expect(executeSessionTitleLlm(ctx, resolveSessionTitleLlmConfig(CONFIG), providerRequest, TITLE_PROVIDER, {
      system: 'Provider system prompt.',
      input: 'Provider input.',
      messageSeqs: [providerRequest.messages[0]!.seq],
      selectReasoningEffort: () => ReasoningEffortId('unsupported-effort'),
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })
    expect(adapter.requests).toEqual([])
  })

  it('refuses a prepared request without one source message', async () => {
    const { ctx } = await withScript(SCRIPT)
    const providerRequest = request(ctx)

    await expect(executeSessionTitleLlm(ctx, resolveSessionTitleLlmConfig(CONFIG), providerRequest, TITLE_PROVIDER, {
      system: 'Provider system prompt.',
      input: 'Provider input.',
      messageSeqs: [],
      selectReasoningEffort: () => undefined,
    })).rejects.toThrow('at least one source message is required')
  })
})
describe('resolveSessionTitleLlmConfig', () => {
  it('refuses a missing object, unknown keys, and invalid limits', () => {
    expect(() => resolveSessionTitleLlmConfig(null as unknown as SessionTitleLlmConfig))
      .toThrow('session-title-llm: configuration is required')
    expect(() => resolveSessionTitleLlmConfig('nope' as unknown as SessionTitleLlmConfig))
      .toThrow('session-title-llm: configuration is required')
    expect(() => resolveSessionTitleLlmConfig({ ...CONFIG, extra: 1 } as unknown as SessionTitleLlmConfig))
      .toThrow('session-title-llm: unknown config key "extra"')
    expect(() => resolveSessionTitleLlmConfig({ ...CONFIG, maxInputBytes: 0 }))
      .toThrow('session-title-llm: maxInputBytes must be a positive integer')
    expect(() => resolveSessionTitleLlmConfig({ ...CONFIG, maxOutputTokens: 1.5 }))
      .toThrow('session-title-llm: maxOutputTokens must be a positive integer')
    expect(() => resolveSessionTitleLlmConfig({ ...CONFIG, timeoutMs: -1 }))
      .toThrow('session-title-llm: timeoutMs must be a positive integer')
    expect(() => resolveSessionTitleLlmConfig({ ...CONFIG, timeoutMs: MAX_TIMER_DELAY_MS + 1 }))
      .toThrow(`session-title-llm: timeoutMs must not exceed ${String(MAX_TIMER_DELAY_MS)}`)
  })

  it('requires the route pair together and as non-empty strings', () => {
    expect(() => resolveSessionTitleLlmConfig({ ...CONFIG, provider: 'route' }))
      .toThrow('session-title-llm: provider and model must be supplied together')
    expect(() => resolveSessionTitleLlmConfig({ ...CONFIG, model: 'model' }))
      .toThrow('session-title-llm: provider and model must be supplied together')
    expect(() => resolveSessionTitleLlmConfig({ ...CONFIG, provider: '', model: 'model' }))
      .toThrow('session-title-llm: provider and model overrides must be non-empty strings')
    expect(() => resolveSessionTitleLlmConfig({ ...CONFIG, provider: 'route', model: '' }))
      .toThrow('session-title-llm: provider and model overrides must be non-empty strings')
    const resolved = resolveSessionTitleLlmConfig({ ...CONFIG, provider: 'route', model: 'model' })
    expect(resolved).toEqual({ ...CONFIG, provider: 'route', model: 'model' })
    expect(Object.isFrozen(resolved)).toBe(true)
  })
})

describe('terminalFinish', () => {
  it('returns the accepted terminal kinds unchanged', () => {
    expect(terminalFinish({ kind: 'stop' })).toEqual({ kind: 'stop' })
    expect(terminalFinish({ kind: 'tool-calls' })).toEqual({ kind: 'tool-calls' })
    expect(terminalFinish({ kind: 'max-tokens' })).toEqual({ kind: 'max-tokens' })
  })

  it('converts error and aborted failures into coded errors', () => {
    expect(() => terminalFinish({ kind: 'error', failure: { message: 'provider exploded', code: 'PROVIDER_ERROR' } }))
      .toThrow(expect.objectContaining({ message: 'provider exploded', code: 'PROVIDER_ERROR' }))
    expect(() => terminalFinish({ kind: 'aborted', failure: { message: 'caller left', code: 'ABORTED' } }))
      .toThrow(expect.objectContaining({ message: 'caller left', code: 'ABORTED' }))
  })
})

describe('executeSessionTitleLlm guards', () => {
  it('refuses an input over the configured byte ceiling', async () => {
    const { ctx, adapter } = await withScript(SCRIPT)
    const providerRequest = request(ctx)
    const limited = resolveSessionTitleLlmConfig({ ...CONFIG, maxInputBytes: 3 })
    await expect(executeSessionTitleLlm(ctx, limited, providerRequest, TITLE_PROVIDER, {
      system: 'Provider system prompt.',
      input: 'too long',
      messageSeqs: [providerRequest.messages[0]!.seq],
      selectReasoningEffort: () => undefined,
    })).rejects.toThrow('session-title-llm: input is 8 bytes, exceeding maxInputBytes 3')
    expect(adapter.requests).toEqual([])
  })

  it('requires a logged route when no explicit pair is configured', async () => {
    const { ctx } = await withScript(SCRIPT)
    const providerRequest = request(ctx)
    const routed = {
      session: providerRequest.session,
      messages: providerRequest.messages,
      signal: providerRequest.signal,
    }
    await expect(executeSessionTitleLlm(ctx, resolveSessionTitleLlmConfig(CONFIG), routed, TITLE_PROVIDER, {
      system: 'Provider system prompt.',
      input: 'Provider input.',
      messageSeqs: [providerRequest.messages[0]!.seq],
      selectReasoningEffort: () => undefined,
    })).rejects.toThrow('session-title-llm: no logged request route is available; configure provider and model together')
  })

  it.each([
    ['error', 'the provider failed', 'PROVIDER_ERROR'],
    ['aborted', 'the provider aborted', 'ABORTED'],
  ] as const)('surfaces a terminal %s finish as a coded error', async (kind, message, code) => {
    const { ctx } = await withScript([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'partial' },
      { type: 'finish', reason: { kind, failure: { message, code } } },
    ])
    const providerRequest = request(ctx)
    await expect(executeSessionTitleLlm(ctx, resolveSessionTitleLlmConfig(CONFIG), providerRequest, TITLE_PROVIDER, {
      system: 'Provider system prompt.',
      input: 'Provider input.',
      messageSeqs: [providerRequest.messages[0]!.seq],
      selectReasoningEffort: () => undefined,
    })).rejects.toMatchObject({ message, code })
  })

  it('records the resolved reasoning effort in the request event', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(LlmRuntime)
    const adapter = new ReasoningAdapter(SCRIPT)
    ctx.llm.registerAdapter(['current-route'], adapter)
    const providerRequest = request(ctx)
    await executeSessionTitleLlm(ctx, resolveSessionTitleLlmConfig(CONFIG), providerRequest, TITLE_PROVIDER, {
      system: 'Provider system prompt.',
      input: 'Provider input.',
      messageSeqs: [providerRequest.messages[0]!.seq],
      selectReasoningEffort: () => ReasoningEffortId('standard'),
    })
    expect(providerRequest.session.snapshotEvents().at(-1)?.data).toMatchObject({
      reasoningEffort: ReasoningEffortId('standard'),
    })
  })
})
