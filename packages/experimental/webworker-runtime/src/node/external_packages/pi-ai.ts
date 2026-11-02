/**
 * `@earendil-works/pi-ai` stub, including its `/providers/all` and `/api/*.lazy`
 * subpaths. The package is Node-only (no `require`/`browser` conditions, Node
 * builtins plus five cloud SDKs in its transport layer) and `llm-pi-ai` imports it
 * statically at module scope, so the row cannot mount without it.
 *
 * Every symbol `llm-pi-ai` imports by name is present: a missing CommonJS symbol
 * would surface as `undefined` at call time instead of a link error. The three catalog readers
 * return empty collections rather than throwing — the row reads them while it
 * activates, and "this deployment ships no pi-ai provider" is the truth here.
 * Everything on a request path is loud.
 */
import { notImplementedFail } from '../notImplementedFail.ts'

const MODULE = '@earendil-works/pi-ai'

/** Provider factory (unavailable). */
export const createProvider = notImplementedFail(MODULE, 'createProvider')

/** Model-list factory (unavailable). */
export const createModels = notImplementedFail(MODULE, 'createModels')

/** Thinking-level catalog (unavailable). */
export const getSupportedThinkingLevels = notImplementedFail(MODULE, 'getSupportedThinkingLevels')

/** Context-overflow predicate (unavailable). */
export const isContextOverflow = notImplementedFail(MODULE, 'isContextOverflow')

/** Preview provider ids, in catalog order. This fixed subset must use valid installed pi-ai
 * identifiers so the adapter can attach authentication metadata. */
const BUILTIN_PROVIDER_IDS: readonly string[] = [
  'amazon-bedrock', 'ant-ling', 'anthropic', 'azure', 'baseten', 'cerebras',
  'cloudflare-ai-gateway', 'cloudflare-workers-ai', 'deepseek', 'fireworks', 'github-copilot',
  'google', 'google-vertex', 'groq', 'huggingface', 'kimi-coding', 'minimax', 'minimax-cn',
  'mistral', 'moonshotai', 'moonshotai-cn', 'nvidia', 'openai', 'openai-codex', 'opencode',
  'opencode-go', 'openrouter', 'qwen-token-plan', 'qwen-token-plan-cn',
  'qwen-token-plan-individual', 'together',
  'vercel-ai-gateway', 'xai', 'xiaomi', 'xiaomi-token-plan-ams', 'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp', 'zai', 'zai-coding-cn',
]

/**
 * Installed catalog providers, read while `llm-pi-ai` activates. Each carries the
 * api-key auth marker the adapter filters on, and no models: the provider
 * directory therefore matches the served deployment while every request path
 * lands on a loud symbol above.
 * @returns one entry per builtin provider.
 */
export function builtinProviders(): unknown[] {
  return BUILTIN_PROVIDER_IDS.map(id => ({
    id,
    name: id,
    auth: { apiKey: { type: 'api-key' } },
    models: [],
  }))
}

/**
 * Provider route ids of the installed catalog. `llm-pi-ai` registers the whole
 * catalog as configurable the moment it mounts and rejects an empty
 * registration, so these are pi-ai's real ids rather than an empty list.
 * @returns the builtin provider ids.
 */
export function getBuiltinProviders(): string[] {
  return [...BUILTIN_PROVIDER_IDS]
}

/**
 * Models of one installed catalog provider.
 * @returns no models.
 */
export function getBuiltinModels(): unknown[] {
  return []
}

/**
 * Every model of one installed catalog provider, chat and non-chat alike.
 * `llm-pi-ai` reads it while it activates to decide whether a provider ships a
 * chat model; this deployment ships none, so the empty collection is the truth.
 * @returns no models.
 */
export function getAllBuiltinModels(): unknown[] {
  return []
}

/**
 * The mutable models collection `llm-pi-ai` builds its routes from. The
 * collection starts empty and every mutation is accepted, so activation reads
 * an empty catalog; streaming is the only member on a request path and stays
 * loud.
 * @returns an empty mutable models collection.
 */
export function builtinModels(): Record<string, unknown> {
  const none: unknown[] = []
  return {
    clearProviders(): void {},
    addProvider(): void {},
    setProvider(): void {},
    removeProvider(): void {},
    listProviders: () => none,
    getModels: () => none,
    getModel: () => undefined,
    streamSimple: notImplementedFail(MODULE, 'streamSimple'),
  }
}

/** Anthropic messages API binding (unavailable). */
export const anthropicMessagesApi = notImplementedFail(MODULE, 'anthropicMessagesApi')

/** OpenAI completions API binding (unavailable). */
export const openAICompletionsApi = notImplementedFail(MODULE, 'openAICompletionsApi')

/** OpenAI responses API binding (unavailable). */
export const openAIResponsesApi = notImplementedFail(MODULE, 'openAIResponsesApi')

/** CommonJS interop marker: the worker loader hands `default` to default imports. */
export const __esModule = true

/** CommonJS default export: the members `require()` hands a caller of this module. */
export default {
  createProvider, createModels, getSupportedThinkingLevels, isContextOverflow, builtinProviders,
  getBuiltinModels, getAllBuiltinModels, builtinModels, getBuiltinProviders, anthropicMessagesApi,
  openAICompletionsApi, openAIResponsesApi,
}
