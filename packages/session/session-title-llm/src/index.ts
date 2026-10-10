/**
 * Shared route, framing, timeout, assembly, and validation policy for
 * model-backed session-title providers.
 * @module @qilin-agent/session-title-llm
 */

import type { Context } from '@qilin-agent/kylin'
import z from '@qilin-agent/schemastery'
import { createUserMessage, BlockAssembler } from '@qilin-agent/llm'
import type { ContextFormed } from '@qilin-agent/llm'
declare module '@qilin-agent/llm' {
  interface MessageSourceMap {
    'qilin-session-title-llm': { kind: 'qilin-session-title-llm' } & ContextFormed
  }
}

import type { ContentBlock, FinishReason, GenerateOptions, Message } from '@qilin-agent/llm'
import { ReasoningEffortId } from '@qilin-agent/llm'
import { deadline, MAX_TIMER_DELAY_MS } from '@qilin-agent/timeout'
import { assertNever, deepFreeze } from '@qilin-agent/util-values'
import type { SessionSeq } from '@qilin-agent/session'
import {
  normalizeSessionTitle,
  SessionTitleProviderId,
} from '@qilin-agent/session-title'
import type {
  SessionTitleAutomaticMode,
  SessionTitleModelIdentity,
  SessionTitleProviderRequest,
  SessionTitleProviderResult,
  SessionTitleUserMessage,
} from '@qilin-agent/session-title'

/** Exact model-visible request recorded before one auxiliary title dispatch. */
export interface SessionTitleLlmRequestEventData {
  /** Registered title-provider identity responsible for the request. */
  readonly titleProvider: SessionTitleProviderId
  /** Exact human `user/message` seqs represented in `messages`. */
  readonly messageSeqs: SessionSeq[]
  /** Exact auxiliary LLM route. */
  readonly route: SessionTitleModelIdentity
  /** Exact auxiliary system prompt. */
  readonly system: string
  /** Exact auxiliary message list. */
  readonly messages: Message[]
  /** Exact auxiliary output-token cap. */
  readonly maxTokens: number
}

declare module '@qilin-agent/session/types' {
  interface SessionEventMap {
    /** Log-only pre-dispatch record of one session-title model request. */
    'session/title-llm-request': SessionTitleLlmRequestEventData
  }
}

/** Capability-owned timeout reason code for auxiliary title requests. */
export const SESSION_TITLE_TIMEOUT_CODE = 'SESSION_TITLE_TIMEOUT'

/** Required deployment policy for one model-backed title plugin. */
export interface SessionTitleLlmConfig {
  /** Target word count for non-CJK titles. */
  readonly targetWords: number
  /** Target character count for Chinese, Japanese, or Korean titles. */
  readonly targetCjkCharacters: number
  /** Maximum UTF-8 bytes in the final JSON-framed user prompt. */
  readonly maxInputBytes: number
  /** Auxiliary generation output-token cap. */
  readonly maxOutputTokens: number
  /** End-to-end auxiliary request deadline in milliseconds. */
  readonly timeoutMs: number
  /** Optional explicit provider route; must be paired with `model`. */
  readonly provider?: string
  /** Optional explicit model id; must be paired with `provider`. */
  readonly model?: string
}

/** Validated immutable model-provider policy. */
export interface ResolvedSessionTitleLlmConfig extends SessionTitleLlmConfig {}

/** Shared Loader field schemas with no library defaults. */
export const SessionTitleLlmConfigFields = {
  targetWords: z.number().step(1).min(1).required(),
  targetCjkCharacters: z.number().step(1).min(1).required(),
  maxInputBytes: z.number().step(1).min(1).required(),
  maxOutputTokens: z.number().step(1).min(1).required(),
  timeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).required(),
  provider: z.string(),
  model: z.string(),
}

/** Shared Loader schema with no library defaults. */
export const SessionTitleLlmConfigSchema: z<SessionTitleLlmConfig> = z.object(SessionTitleLlmConfigFields)

/** Complete configuration key set for direct construction validation. */
const CONFIG_KEYS: ReadonlySet<string> = new Set([
  'targetWords',
  'targetCjkCharacters',
  'maxInputBytes',
  'maxOutputTokens',
  'timeoutMs',
  'provider',
  'model',
])

/** Validate one positive integer limit. */
function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`session-title-llm: ${name} must be a positive integer`)
  }
}

/**
 * Validate and detach required model-provider configuration.
 * @param config - untrusted plugin configuration.
 * @returns immutable policy with optional route absence preserved.
 */
export function resolveSessionTitleLlmConfig(
  config: SessionTitleLlmConfig,
): ResolvedSessionTitleLlmConfig {
  const candidate: unknown = config
  if (candidate === null || typeof candidate !== 'object') {
    throw new Error('session-title-llm: configuration is required')
  }
  const value = candidate as SessionTitleLlmConfig
  for (const key of Object.keys(value)) {
    if (!CONFIG_KEYS.has(key)) throw new Error(`session-title-llm: unknown config key "${key}"`)
  }
  assertPositiveInteger('targetWords', value.targetWords)
  assertPositiveInteger('targetCjkCharacters', value.targetCjkCharacters)
  assertPositiveInteger('maxInputBytes', value.maxInputBytes)
  assertPositiveInteger('maxOutputTokens', value.maxOutputTokens)
  assertPositiveInteger('timeoutMs', value.timeoutMs)
  if (value.timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`session-title-llm: timeoutMs must not exceed ${MAX_TIMER_DELAY_MS}`)
  }
  const hasProvider = value.provider !== undefined
  const hasModel = value.model !== undefined
  if (hasProvider !== hasModel) {
    throw new Error('session-title-llm: provider and model must be supplied together')
  }
  if (hasProvider
    && (typeof value.provider !== 'string' || value.provider.length === 0
      || typeof value.model !== 'string' || value.model.length === 0)) {
    throw new Error('session-title-llm: provider and model overrides must be non-empty strings')
  }
  return deepFreeze({ ...value })
}

/** Select the provider-owned message subset from one fixed service revision. */
export type SessionTitleLlmMessageSelector = (
  messages: readonly SessionTitleUserMessage[],
) => readonly SessionTitleUserMessage[]

/**
 * Provider-prepared model input, source-message attribution, and the
 * provider-owned reasoning selector.
 */
export interface SessionTitleLlmPreparedRequest {
  /** Exact system prompt supplied by the provider. */
  readonly system: string
  /** Exact user message text supplied by the provider, including any framing. */
  readonly input: string
  /** Exact human `user/message` seqs represented by `input`, in log order. */
  readonly messageSeqs: readonly SessionSeq[]
  /**
   * Provider-owned reasoning selection, applied before route preparation.
   * The provider reads the route it captured in the request; resolved model
   * metadata is not part of this contract.
   * @returns a supported effort id, or `undefined` to use the route's normal default.
   */
  readonly selectReasoningEffort: () => ReasoningEffortId | undefined
}

/** Terminal finish kinds forwarded to a provider for its own interpretation. */
export type SessionTitleLlmFinish = Extract<FinishReason, { kind: 'stop' | 'tool-calls' | 'max-tokens' }>

/** Assembled auxiliary model response for one provider to interpret. */
export interface SessionTitleLlmResponse {
  /** Assembled content blocks in stream order; the provider rejects unwanted block types. */
  readonly blocks: readonly ContentBlock[]
  /** Terminal finish reason forwarded without title-output interpretation. */
  readonly finish: SessionTitleLlmFinish
  /** Exact auxiliary model route that produced the response. */
  readonly model: SessionTitleModelIdentity
}

/**
 * Register one model-backed provider through the shared configuration and call policy.
 * @param ctx - context exposing the title and LLM services.
 * @param config - untrusted required deployment policy.
 * @param id - stable plugin id recorded with generated titles.
 * @param automatic - provider-owned automatic generation cadence.
 * @param selectMessages - exact source-message selection for one revision.
 */
export function registerSessionTitleLlmProvider(
  ctx: Context,
  config: SessionTitleLlmConfig,
  id: string,
  automatic: SessionTitleAutomaticMode,
  selectMessages: SessionTitleLlmMessageSelector,
): void {
  const resolved = resolveSessionTitleLlmConfig(config)
  const titleProvider = SessionTitleProviderId(id)
  ctx.sessionTitle.register({
    id: titleProvider,
    automatic,
    async generate(request) {
      // Only the all-prompts cadence may preserve an existing title: a provider
      // title inherited from the first-prompt provider still counts as current.
      const current = automatic === 'all-prompts' ? ctx.sessionTitle.get(request.session) : undefined
      return generateSessionTitleWithLlm(
        ctx,
        resolved,
        request,
        selectMessages(request.messages),
        titleProvider,
        current?.source.kind === 'provider' ? current.title : undefined,
      )
    },
  })
}

/** Resolve the explicit pair or the exact route captured from `request/header`. */
function resolveRoute(
  config: ResolvedSessionTitleLlmConfig,
  request: SessionTitleProviderRequest,
): SessionTitleModelIdentity {
  if (config.provider !== undefined && config.model !== undefined) {
    return { provider: config.provider, model: config.model }
  }
  if (request.route === undefined) {
    throw new Error('session-title-llm: no logged request route is available; configure provider and model together')
  }
  return request.route
}

/** Stable language-aware system instruction shared by both provider plugins. */
function systemPrompt(config: ResolvedSessionTitleLlmConfig, hasCurrentTitle: boolean): string {
  return [
    'Create a concise title for an AI coding-assistant session from the supplied human messages.',
    'Return only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.',
    'Use the language of the messages.',
    `Aim for about ${config.targetWords} words in non-CJK languages or ${config.targetCjkCharacters} CJK characters.`,
    ...hasCurrentTitle ? [
      'An existing title is supplied as currentTitle. If it still accurately describes the main topic or task, return it exactly unchanged.',
      'Follow-up questions, additional details within the same topic, acknowledgements such as "thanks", and requests to continue do not by themselves justify a title change.',
      'Do not reword, polish, shorten, or replace synonyms in an adequate title. Keeping its exact wording takes priority over the target length.',
      'Change the title only when the messages materially change or expand the main topic or task so that the existing title is no longer accurate.',
    ] : [],
  ].join('\n')
}

/** Frame exact messages as JSON so user text cannot break structural delimiters. */
function frameMessages(messages: readonly SessionTitleUserMessage[], currentTitle?: string): string {
  if (currentTitle !== undefined) {
    return `Update the session title from this JSON object:\n${JSON.stringify({ currentTitle, messages })}`
  }
  return `Generate the session title from this JSON array of human messages:\n${JSON.stringify(messages)}`
}

/**
 * Classify one terminal finish reason. Operational failures throw; every other
 * terminal kind is returned for the provider to accept or reject.
 * @param finish - terminal finish reason from the assembled stream.
 * @returns the provider-facing finish reason.
 * @throws {Error} on a provider or caller abort, or an impossible finish variant.
 */
export function terminalFinish(finish: FinishReason): SessionTitleLlmFinish {
  switch (finish.kind) {
    case 'stop':
    case 'tool-calls':
    case 'max-tokens':
      return finish
    case 'error':
    case 'aborted': {
      const error = new Error(finish.failure.message) as Error & { code?: string }
      error.code = finish.failure.code
      throw error
    }
    /* v8 ignore next -- closed FinishReason union exhaustiveness guard */
    default: return assertNever(finish, 'FinishReason')
  }
}

/**
 * Execute one prepared auxiliary title request.
 *
 * The provider owns the system prompt, user input, reasoning selection, and
 * output interpretation. This function owns route preparation, the final input
 * byte limit, the output-token cap, the end-to-end deadline, cancellation, the
 * exact `session/title-llm-request` record, and stream assembly.
 * @param ctx - context exposing the registered LLM service.
 * @param config - validated execution controls.
 * @param request - service-owned session, route, message snapshot, current title, and cancellation.
 * @param titleProvider - registered title-provider identity recorded with the request.
 * @param prepared - provider system prompt, input, source-message seqs, and reasoning selector.
 * @returns assembled response blocks, terminal finish, and the exact route used.
 * @throws {Error} when input bounds, route preparation, the deadline, cancellation, or an operational finish failure occurs.
 */
export async function executeSessionTitleLlm(
  ctx: Context,
  config: ResolvedSessionTitleLlmConfig,
  request: SessionTitleProviderRequest,
  titleProvider: SessionTitleProviderId,
  prepared: SessionTitleLlmPreparedRequest,
): Promise<SessionTitleLlmResponse> {
  request.signal.throwIfAborted()
  if (prepared.messageSeqs.length === 0) {
    throw new Error('session-title-llm: at least one source message is required')
  }
  const inputBytes = Buffer.byteLength(prepared.input, 'utf8')
  if (inputBytes > config.maxInputBytes) {
    throw new Error(`session-title-llm: input is ${inputBytes} bytes, exceeding maxInputBytes ${config.maxInputBytes}`)
  }
  const route = resolveRoute(config, request)
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: prepared.input }],
    source: { kind: 'qilin-session-title-llm' },
  })]
  using callDeadline = deadline(request.signal, config.timeoutMs, SESSION_TITLE_TIMEOUT_CODE)
  const maxTokens = config.maxOutputTokens
  const effort = prepared.selectReasoningEffort()
  const call = await ctx.llm.prepareCall({
    ...route, maxTokens, ...effort === undefined ? {} : { reasoningEffort: effort },
  }, callDeadline.signal)
  const options: GenerateOptions = deepFreeze({
    ...call.config,
    messages,
    system: prepared.system,
    sessionId: request.session.id,
    purpose: 'session-title',
    signal: callDeadline.signal,
  })
  request.session.append('session/title-llm-request', {
    titleProvider,
    messageSeqs: [...prepared.messageSeqs],
    route,
    system: prepared.system,
    messages,
    maxTokens,
    ...call.config.reasoningEffort === undefined ? {} : { reasoningEffort: call.config.reasoningEffort },
  })
  callDeadline.signal.throwIfAborted()
  const assembler = new BlockAssembler()
  for await (const chunk of call.stream(options)) {
    callDeadline.signal.throwIfAborted()
    assembler.push(chunk)
  }
  callDeadline.signal.throwIfAborted()
  const finish = terminalFinish(assembler.finish)
  return { blocks: assembler.blocks(), finish, model: route }
}

/**
 * Generate one title through the shared auxiliary LLM call.
 * @param ctx - context exposing the registered LLM service.
 * @param config - validated model-provider policy.
 * @param request - service-owned session, route, message snapshot, and cancellation.
 * @param selectedMessages - exact provider-selected subset to frame and attribute.
 * @param titleProvider - registered title-provider identity recorded with the request.
 * @param currentTitle - existing model-generated title to preserve while it still describes the main topic.
 * @returns normalized non-empty title, exact source seqs, and used model route.
 */
export async function generateSessionTitleWithLlm(
  ctx: Context,
  config: ResolvedSessionTitleLlmConfig,
  request: SessionTitleProviderRequest,
  selectedMessages: readonly SessionTitleUserMessage[],
  titleProvider: SessionTitleProviderId,
  currentTitle?: string,
): Promise<SessionTitleProviderResult> {
  const messageSeqs = selectedMessages.map(message => message.seq)
  request.signal.throwIfAborted()
  if (messageSeqs.length === 0) {
    throw new Error('session-title-llm: at least one source message is required')
  }
  const { blocks, finish, model } = await executeSessionTitleLlm(ctx, config, request, titleProvider, {
    system: systemPrompt(config, currentTitle !== undefined),
    input: frameMessages(selectedMessages, currentTitle),
    messageSeqs,
    selectReasoningEffort: () => undefined,
  })
  // The shared framing accepts only a plain title; a provider that wants other
  // terminal kinds interprets them itself instead of calling this helper.
  if (finish.kind === 'max-tokens') throw new Error('session-title-llm: title output reached maxOutputTokens')
  if (finish.kind === 'tool-calls') throw new Error('session-title-llm: title model unexpectedly requested a tool')
  if (blocks.some(block => block.type === 'tool-call')) {
    throw new Error('session-title-llm: title output must contain text only')
  }
  const text = blocks
    .filter((block): block is Extract<(typeof blocks)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join(' ')
  const title = normalizeSessionTitle(text, Number.MAX_SAFE_INTEGER)
  if (title.length === 0) throw new Error('session-title-llm: title model produced no text')
  return { title, messageSeqs, model }
}
