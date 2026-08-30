import type { Message } from "@langchain/langgraph-sdk";

import type { MessageSegment } from "./segments";
import { getUsageMetadata } from "./usage";

export type AssistantPresentationMetadata = {
  timestamp?: number;
  model?: string;
  totalTokens?: number;
};

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike | undefined {
  return typeof value === "object" && value !== null
    ? (value as RecordLike)
    : undefined;
}

function readPath(root: unknown, path: string[]): unknown {
  let value: unknown = root;
  for (const key of path) {
    const record = asRecord(value);
    if (!record) return undefined;
    value = record[key];
  }
  return value;
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    const milliseconds = Math.abs(value) < 1e12 ? value * 1000 : value;
    return Number.isFinite(new Date(milliseconds).getTime())
      ? milliseconds
      : undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return parseTimestamp(numeric);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstValidTimestamp(message: Message): number | undefined {
  const candidates: unknown[][] = [
    [(message as RecordLike).created_at],
    [(message as RecordLike).createdAt],
    [(message as RecordLike).timestamp],
    [readPath(message, ["metadata", "created_at"])],
    [readPath(message, ["metadata", "createdAt"])],
    [readPath(message, ["metadata", "timestamp"])],
    [readPath(message, ["response_metadata", "created_at"])],
    [readPath(message, ["response_metadata", "createdAt"])],
    [readPath(message, ["response_metadata", "timestamp"])],
    [readPath(message, ["additional_kwargs", "created_at"])],
    [readPath(message, ["additional_kwargs", "createdAt"])],
    [readPath(message, ["additional_kwargs", "timestamp"])],
  ];

  for (const [value] of candidates) {
    const timestamp = parseTimestamp(value);
    if (timestamp !== undefined) return timestamp;
  }
  return undefined;
}

function firstNonEmptyString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function getModelName(message: Message): string | undefined {
  return firstNonEmptyString([
    readPath(message, ["response_metadata", "model_name"]),
    readPath(message, ["response_metadata", "model"]),
    readPath(message, ["metadata", "model_name"]),
    readPath(message, ["metadata", "model"]),
    readPath(message, ["additional_kwargs", "model_name"]),
    readPath(message, ["additional_kwargs", "model"]),
    (message as RecordLike).model,
  ]);
}

export function getVisibleAssistantText(segments: MessageSegment[]): string {
  return segments
    .filter(
      (segment): segment is Extract<MessageSegment, { kind: "prose" }> =>
        segment.kind === "prose",
    )
    .map((segment) => segment.content.trim())
    .filter((content) => content.length > 0)
    .join("\n\n");
}

/**
 * Resolve the run that produced an assistant message, for per-run feedback.
 *
 * The gateway stamps the triggering run id onto the human input that started
 * a turn (`thread_data_middleware` writes ``additional_kwargs.run_id``), so
 * the run behind an assistant turn is found on the nearest *preceding*
 * human message. Walks backwards from the assistant message, skipping
 * interleaved tool/AI messages, and stops at the first human message
 * (older turns are irrelevant). Returns undefined when the turn boundary
 * cannot be resolved — callers should hide run-scoped actions then.
 */
export function getAssistantRunId(
  messages: readonly Message[],
  assistantMessageId: string | undefined,
): string | undefined {
  if (!assistantMessageId) return undefined;
  const index = messages.findIndex(
    (candidate) => candidate.id === assistantMessageId,
  );
  if (index < 0) return undefined;
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const candidate = messages[cursor];
    if (!candidate || candidate.type !== "human") continue;
    return firstNonEmptyString([
      readPath(candidate, ["additional_kwargs", "run_id"]),
      readPath(candidate, ["metadata", "run_id"]),
      readPath(candidate, ["metadata", "langgraph_run_id"]),
      readPath(candidate, ["response_metadata", "langgraph_run_id"]),
    ]);
  }
  return undefined;
}

export function getAssistantPresentationMetadata(
  message: Message,
): AssistantPresentationMetadata {
  const metadata: AssistantPresentationMetadata = {};
  const timestamp = firstValidTimestamp(message);
  if (timestamp !== undefined) metadata.timestamp = timestamp;
  const model = getModelName(message);
  if (model) metadata.model = model;
  const usage = getUsageMetadata(message);
  if (usage) metadata.totalTokens = usage.totalTokens;
  return metadata;
}

export function formatAssistantTime(
  timestamp: number,
  locale = "zh-CN",
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
