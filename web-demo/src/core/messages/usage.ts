import type { Message } from "@langchain/langgraph-sdk";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /**
   * Prompt-cache-hit input tokens. Filled in when the underlying provider
   * reports cache hits (OpenAI `input_token_details.cached_tokens`,
   * Anthropic `cache_read_input_tokens`, or the LangChain
   * `input_token_details.cache_read` mirror). Optional so existing callers
   * that only read the three primary fields stay untouched.
   */
  cacheReadTokens?: number;
}

/**
 * Extract usage_metadata from an AI message if present.
 * The field is added by the backend (PR #1218) but not typed in the SDK.
 *
 * Also reads prompt-cache-hit counters from whichever naming the provider
 * uses so we can render cache hit rates in the per-thread summary bar.
 */
export function getUsageMetadata(message: Message): TokenUsage | null {
  if (message.type !== "ai") {
    return null;
  }
  const usage = (message as Record<string, unknown>).usage_metadata as
    | {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
        input_token_details?: {
          cache_read?: number;
          cached_tokens?: number;
        };
        cache_read_input_tokens?: number;
      }
    | undefined;
  if (!usage) {
    return null;
  }
  const cacheRead =
    usage.input_token_details?.cache_read ??
    usage.input_token_details?.cached_tokens ??
    usage.cache_read_input_tokens ??
    0;
  const result: TokenUsage = {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  };
  if (cacheRead > 0) {
    result.cacheReadTokens = cacheRead;
  }
  return result;
}

/**
 * Accumulate token usage across all AI messages in a thread.
 */
export function accumulateUsage(messages: Message[]): TokenUsage | null {
  const cumulative: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  let hasUsage = false;
  let cacheReadTotal = 0;
  for (const message of messages) {
    const usage = getUsageMetadata(message);
    if (usage) {
      hasUsage = true;
      cumulative.inputTokens += usage.inputTokens;
      cumulative.outputTokens += usage.outputTokens;
      cumulative.totalTokens += usage.totalTokens;
      cacheReadTotal += usage.cacheReadTokens ?? 0;
    }
  }
  if (!hasUsage) return null;
  if (cacheReadTotal > 0) {
    cumulative.cacheReadTokens = cacheReadTotal;
  }
  return cumulative;
}

/**
 * Per-model token breakdown for a single AI message. Model name is read
 * from the message's `response_metadata.model_name` (LangGraph convention)
 * but falls back to the SDK-native `model` field if available.
 */
interface ModelBreakdown {
  name: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  calls: number;
}

export interface TaskUsageDetail {
  total: TokenUsage | null;
  callCount: number;
  byModel: ModelBreakdown[];
}

function extractModelName(message: Message): string {
  const meta = message as Record<string, unknown>;
  const responseMeta = meta.response_metadata as
    | { model_name?: string }
    | undefined;
  if (responseMeta?.model_name) return responseMeta.model_name;
  const model = (meta as { model?: string }).model;
  if (typeof model === "string" && model.length > 0) return model;
  return "unknown";
}

/**
 * Aggregate per-thread usage with model-level breakdown and LLM call count.
 * Used by the new-task input box summary bar + hover popover.
 */
export function accumulateUsageDetail(messages: Message[]): TaskUsageDetail {
  const cumulative: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  let hasUsage = false;
  let cacheReadTotal = 0;
  let callCount = 0;
  const byModel = new Map<string, ModelBreakdown>();

  for (const message of messages) {
    const usage = getUsageMetadata(message);
    if (!usage) continue;
    hasUsage = true;
    callCount += 1;
    cumulative.inputTokens += usage.inputTokens;
    cumulative.outputTokens += usage.outputTokens;
    cumulative.totalTokens += usage.totalTokens;
    cacheReadTotal += usage.cacheReadTokens ?? 0;

    const name = extractModelName(message);
    const existing = byModel.get(name) ?? {
      name,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      calls: 0,
    };
    existing.inputTokens += usage.inputTokens;
    existing.outputTokens += usage.outputTokens;
    existing.cacheReadTokens += usage.cacheReadTokens ?? 0;
    existing.calls += 1;
    byModel.set(name, existing);
  }

  if (!hasUsage) {
    return { total: null, callCount: 0, byModel: [] };
  }
  if (cacheReadTotal > 0) {
    cumulative.cacheReadTokens = cacheReadTotal;
  }
  // Sort by total tokens descending so the most-used model appears first.
  const sortedByModel = Array.from(byModel.values()).sort(
    (a, b) =>
      b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
  );
  return { total: cumulative, callCount, byModel: sortedByModel };
}

/**
 * Validate a raw `{input,output,total}_tokens` object into {@link TokenUsage}.
 *
 * Every key must be a finite, non-negative number or the whole snapshot is
 * rejected as `undefined`. Used by sub-agent usage surfaces (live task events
 * and terminal ToolMessage metadata) that receive untyped payloads.
 */
export function normalizeTokenUsage(value: unknown): TokenUsage | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const inputTokens = nonNegativeNumber(record.input_tokens);
  const outputTokens = nonNegativeNumber(record.output_tokens);
  const totalTokens = nonNegativeNumber(record.total_tokens);
  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    totalTokens === undefined
  ) {
    return undefined;
  }
  return { inputTokens, outputTokens, totalTokens };
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function hasNonZeroUsage(
  usage: TokenUsage | null | undefined,
): usage is TokenUsage {
  return (
    usage !== null &&
    usage !== undefined &&
    (usage.inputTokens > 0 || usage.outputTokens > 0 || usage.totalTokens > 0)
  );
}

export function addUsage(base: TokenUsage, delta: TokenUsage): TokenUsage {
  return {
    inputTokens: base.inputTokens + delta.inputTokens,
    outputTokens: base.outputTokens + delta.outputTokens,
    totalTokens: base.totalTokens + delta.totalTokens,
  };
}

export function selectHeaderTokenUsage({
  backendUsage,
  messages,
  pendingMessages = [],
}: {
  backendUsage?: TokenUsage | null;
  messages: Message[];
  pendingMessages?: Message[];
}): TokenUsage | null {
  if (hasNonZeroUsage(backendUsage)) {
    const pendingUsage = accumulateUsage(pendingMessages);
    return pendingUsage ? addUsage(backendUsage, pendingUsage) : backendUsage;
  }
  return accumulateUsage(messages);
}

/**
 * Format a token count for display: 1234 -> "1,234", 12345 -> "12.3K"
 */
export function formatTokenCount(count: number): string {
  if (count < 10_000) {
    return count.toLocaleString();
  }
  return `${(count / 1000).toFixed(1)}K`;
}
