/**
 * Pure event-dispatch logic extracted from {@link useAgentThread}'s
 * `onCustomEvent` callback so it can be unit-tested without mounting
 * a React component or the `useStream` harness.
 *
 * The handler is intentionally side-effect free apart from the injected
 * dependencies (`toast`, `updateSubtask`). This keeps
 * it deterministic and easy to assert against.
 */

import type { AIMessage } from "@langchain/langgraph-sdk";
import { toast } from "sonner";

import type { SubagentStepEvent } from "./run-events-api";
import { textOfMessage } from "./utils";

/** Callback used to feed `task_*` events into the subtask UI. */
export type UpdateSubtaskFn = (update: {
  id: string;
  latestMessage?: AIMessage;
  steps?: SubagentStepEvent[];
  status?: "in_progress" | "completed" | "failed";
  started_at?: string;
  completed_at?: string;
  model_name?: string;
  token_usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  result?: string;
  error?: string;
  duration_ms?: number;
}) => void;

/** All external collaborators the event handler needs. */
export interface StreamEventDependencies {
  /** Subtask context updater from `useUpdateSubtask`. */
  updateSubtask: UpdateSubtaskFn;
}

/**
 * Dispatch a single SSE custom event to the appropriate UI feedback.
 *
 * Supported event types:
 *  - `task_started`           → mark subtask as in_progress, record start time
 *  - `task_running`           → forward latest AI message + step to subtask UI
 *  - `task_completed`         → mark completed, record model/usage/duration
 *  - `subagent_limit_truncated` → toast warning (tasks silently dropped)
 *  - `task_failed` / `task_timed_out` / `task_cancelled` → toast error
 *  - `llm_retry`              → generic toast with retry message
 *
 * Unknown events are ignored (forwards-compatible with future backend types).
 */
export function handleStreamEvent(
  event: unknown,
  deps: StreamEventDependencies,
): void {
  const { updateSubtask } = deps;

  if (!isObjectWithKey(event, "type")) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const type = (event as any).type;

  if (type === "task_started") {
    const e = event as {
      type: "task_started";
      task_id: string;
      description?: string;
    };
    updateSubtask({
      id: e.task_id,
      status: "in_progress",
      started_at: new Date().toISOString(),
    });
    return;
  }

  if (type === "task_running") {
    const e = event as {
      type: "task_running";
      task_id: string;
      message: AIMessage;
      message_index?: number;
    };
    updateSubtask({ id: e.task_id, latestMessage: e.message });

    // Also append as a step for the timeline (if message_index is present).
    // Build the step from the actual message payload so the timeline has
    // meaningful content (kind / text / tool_calls / tool_name) instead of
    // empty rows that render as generic "thinking" placeholders.
    if (e.message_index != null) {
      const text = textOfMessage(e.message);
      // The runtime message may actually be a ToolMessage even though the
      // declared type is AIMessage — check the real type defensively.
      const messageType = (e.message as { type?: string }).type;
      const toolCalls = e.message.tool_calls?.length
        ? e.message.tool_calls.map((tc) => ({
            name: tc.name,
            args: tc.args as unknown,
          }))
        : undefined;
      const step: SubagentStepEvent = {
        event_type: "subagent.step",
        content: {
          task_id: e.task_id,
          message_index: e.message_index,
          kind: messageType === "tool" ? "tool" : "ai",
          ...(text ? { text } : {}),
          ...(messageType === "tool" && e.message.name
            ? { tool_name: e.message.name }
            : {}),
          ...(toolCalls ? { tool_calls: toolCalls } : {}),
        },
        metadata: { task_id: e.task_id, message_index: e.message_index },
      };
      updateSubtask({ id: e.task_id, steps: [step] });
    }
    return;
  }

  if (type === "task_completed") {
    const e = event as {
      type: "task_completed";
      task_id: string;
      result?: string;
      model_name?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    updateSubtask({
      id: e.task_id,
      status: "completed",
      completed_at: new Date().toISOString(),
      result: e.result,
      model_name: e.model_name,
      token_usage: e.usage,
    });
    return;
  }

  if (type === "subagent_limit_truncated") {
    const e = event as {
      type: "subagent_limit_truncated";
      dropped_count: number;
      max_concurrent: number;
    };
    toast.warning(
      `已达到子任务并发上限（${e.max_concurrent}），${e.dropped_count} 个任务被跳过。请等待当前任务完成后再试。`,
    );
    return;
  }

  if (type === "task_failed" || type === "task_timed_out" || type === "task_cancelled") {
    const e = event as {
      type: "task_failed" | "task_timed_out" | "task_cancelled";
      task_id: string;
      error?: string;
      model_name?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const labels: Record<string, string> = {
      task_failed: "子任务执行失败",
      task_timed_out: "子任务执行超时",
      task_cancelled: "子任务已取消",
    };
    const label = labels[type] ?? "子任务异常";
    const errorDetail = e.error ? `：${e.error}` : "";
    toast.error(`${label}${errorDetail}`);
    updateSubtask({
      id: e.task_id,
      status: "failed",
      completed_at: new Date().toISOString(),
      error: e.error,
      model_name: e.model_name,
      token_usage: e.usage,
    });
    return;
  }

  if (
    type === "llm_retry" &&
    "message" in (event as object) &&
    typeof (event as { message: unknown }).message === "string" &&
    (event as { message: string }).message.trim()
  ) {
    const e = event as { type: "llm_retry"; message: string };
    toast(e.message);
  }

  // task_interrupted toast disabled per user request
  // Unknown event types are silently ignored.
}

/** Type guard: is `value` a non-null object that contains `key`? */
function isObjectWithKey(value: unknown, key: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    key in value
  );
}
