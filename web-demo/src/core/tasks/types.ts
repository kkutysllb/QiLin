import type { AIMessage } from "@langchain/langgraph-sdk";

import type { SubagentStepEvent } from "@/core/threads/run-events-api";

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface Subtask {
  id: string;
  status: "in_progress" | "completed" | "failed";
  subagent_type: string;
  description: string;
  latestMessage?: AIMessage;
  prompt: string;
  result?: string;
  error?: string;
  /** Persisted or streamed execution steps (timeline data). */
  steps?: SubagentStepEvent[];
  /** Model name used by the subagent. */
  model_name?: string;
  /** Token usage from the terminal event. */
  token_usage?: TokenUsage;
  /** ISO timestamp when the task started. */
  started_at?: string;
  /** ISO timestamp when the task completed. */
  completed_at?: string;
  /** Duration in milliseconds. */
  duration_ms?: number;
}
