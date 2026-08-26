export interface Model {
  id: string;
  name: string;
  use: string;
  model: string;
  display_name: string;
  description?: string | null;
  api_key?: string | null;
  base_url?: string | null;
  /** YAML key that carries the endpoint (base_url/api_base/api_url). */
  endpoint_field?: string | null;
  max_tokens?: number | null;
  max_input_tokens?: number | null;
  max_retries?: number | null;
  temperature?: number | null;
  request_timeout?: number | null;
  supports_thinking?: boolean;
  supports_vision?: boolean;
  supports_reasoning_effort?: boolean;
  reasoning_effort_values?: string[] | null;
  when_thinking_enabled?: Record<string, unknown> | null;
  when_thinking_disabled?: Record<string, unknown> | null;
}

export interface ModelRequest {
  name: string;
  display_name?: string | null;
  use: string;
  model: string;
  api_key?: string | null;
  base_url?: string | null;
  /** YAML key to store base_url under (e.g. 'api_base' for DeepSeek). */
  endpoint_field?: string | null;
  max_tokens?: number | null;
  max_input_tokens?: number | null;
  max_retries?: number | null;
  temperature?: number | null;
  request_timeout?: number | null;
  description?: string | null;
  supports_thinking?: boolean;
  supports_vision?: boolean;
  supports_reasoning_effort?: boolean;
  reasoning_effort_values?: string[] | null;
  when_thinking_enabled?: Record<string, unknown> | null;
  when_thinking_disabled?: Record<string, unknown> | null;
}

export interface TokenUsageSettings {
  enabled: boolean;
}

export interface ModelsResponse {
  models: Model[];
  token_usage: TokenUsageSettings;
}
