export interface AgentModelSettings {
  temperature?: number | null;
  max_tokens?: number | null;
}

/**
 * 推理深度档位，即原「模式」档位（minimal→闪速 / low→思考 / medium→Pro /
 * high→Ultra）。全局唯一来源：input-box 与本地设置层均从此 import。
 */
export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

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
