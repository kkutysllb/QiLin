import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

/** A single persisted or streamed subagent step event. */
export interface SubagentStepEvent {
  seq?: number;
  event_type: string; // subagent.start | subagent.step | subagent.end
  category?: string;
  content: {
    task_id: string;
    description?: string;
    message_index?: number;
    kind?: "ai" | "tool";
    text?: string;
    truncated?: boolean;
    tool_name?: string;
    tool_calls?: Array<{ name: string; args: unknown; args_truncated?: boolean }>;
    status?: string;
    model_name?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    result?: string;
    result_truncated?: boolean;
    error?: string;
    error_truncated?: boolean;
  };
  metadata: Record<string, unknown>;
  created_at?: string;
}

/** Fetch persisted step events for a single subtask from the run events API. */
export async function fetchTaskEvents(
  threadId: string,
  runId: string,
  taskId: string,
): Promise<SubagentStepEvent[]> {
  const url = `${getBackendBaseURL()}/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/events?task_id=${encodeURIComponent(taskId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch task events: ${res.statusText}`);
  }
  const data = (await res.json()) as SubagentStepEvent[];
  return data;
}
