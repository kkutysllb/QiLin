/** Model subsystem types — 对应 /api/models/* 端点 */
import type { ID, ISODateString } from './common';

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'ollama' | 'custom';

export interface ModelConfig {
  name: ID;
  provider: ModelProvider | string;
  model_id: string;
  display_name?: string;
  enabled?: boolean;
  api_base?: string;
  api_key_env?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  timeout_seconds?: number;
  description?: string;
  tags?: string[];
  created_at?: ISODateString;
  updated_at?: ISODateString;
}

export interface ModelsListResponse {
  models: ModelConfig[];
  token_usage?: {
    enabled: boolean;
  };
}

export interface ModelCreateInput {
  name: ID;
  provider: ModelProvider | string;
  model_id: string;
  display_name?: string;
  enabled?: boolean;
  api_base?: string;
  api_key_env?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  timeout_seconds?: number;
  description?: string;
  tags?: string[];
}

export interface ModelUpdateInput {
  provider?: ModelProvider | string;
  model_id?: string;
  display_name?: string;
  enabled?: boolean;
  api_base?: string;
  api_key_env?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  timeout_seconds?: number;
  description?: string;
  tags?: string[];
}

// Backwards-compatible re-export for Phase 0/1 imports
export type { ModelConfig as ModelInfo };
