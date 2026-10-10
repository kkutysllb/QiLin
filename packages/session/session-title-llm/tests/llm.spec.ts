import { Context } from '@qilin-agent/kylin'
import { describe, expect, it } from 'vitest'
import LlmRuntime, { createUserMessage, LlmAdapter, ReasoningEffortId } from '@qilin-agent/llm'
import type { GenerateOptions, StreamChunk } from '@qilin-agent/llm'
import SessionStore, { SessionId } from '@qilin-agent/session'
import { SessionTitleProviderId } from '@qilin-agent/session-title'
import type { SessionTitleProviderRequest } from '@qilin-agent/session-title'
import {
  executeSessionTitleLlm,
  resolveSessionTitleLlmConfig,
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
