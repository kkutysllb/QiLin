export interface AgentModelSettings {
  temperature?: number | null;
  max_tokens?: number | null;
}

export type ReasoningEffort = "low" | "medium" | "high";

export interface Agent {
  name: string;
  description: string;
  model: string | null;
  tool_groups: string[] | null;
  skills: string[] | null;
  soul?: string | null;
  model_settings?: AgentModelSettings | null;
  thinking_enabled?: boolean | null;
  reasoning_effort?: ReasoningEffort | null;
  max_turns?: number | null;
  timeout_seconds?: number | null;
  disallowed_tools?: string[] | null;
  role?: string | null;
}

export interface CreateAgentRequest {
  name: string;
  description?: string;
  model?: string | null;
  tool_groups?: string[] | null;
  skills?: string[] | null;
  soul?: string;
  model_settings?: AgentModelSettings | null;
  thinking_enabled?: boolean | null;
  reasoning_effort?: ReasoningEffort | null;
  max_turns?: number | null;
  timeout_seconds?: number | null;
  disallowed_tools?: string[] | null;
  role?: string | null;
}

export interface UpdateAgentRequest {
  description?: string | null;
  model?: string | null;
  tool_groups?: string[] | null;
  skills?: string[] | null;
  soul?: string | null;
  model_settings?: AgentModelSettings | null;
  thinking_enabled?: boolean | null;
  reasoning_effort?: ReasoningEffort | null;
  max_turns?: number | null;
  timeout_seconds?: number | null;
  disallowed_tools?: string[] | null;
  role?: string | null;
}

/** Worker spec projected from an agent (matches orchestration.workers schema). */
export interface WorkerSpec {
  name: string;
  description: string;
  system_prompt?: string | null;
  tools?: string[] | null;
  disallowed_tools?: string[] | null;
  skills?: string[] | null;
  model?: string | null;
  max_turns?: number | null;
  timeout_seconds?: number | null;
  role?: string;
}

export interface AgentSuggestionRequest {
  description: string;
  model_name?: string | null;
}

export interface AgentSuggestionResponse {
  name: string;
  description: string;
  soul: string;
  tool_groups: string[];
  disallowed_tools: string[];
  skills: string[];
  model: string | null;
  thinking_enabled: boolean | null;
  reasoning_effort: ReasoningEffort | null;
  max_turns: number | null;
  timeout_seconds: number | null;
  role: string;
  rationale: string;
}
