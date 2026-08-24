/** Config subsystem types — 对应 /api/config/* 端点 */

export interface ConfigSection {
  name: string;
  data: Record<string, unknown>;
}

export interface ConfigFullResponse {
  config: Record<string, unknown>;
  config_version?: number;
}

export interface ConfigSectionResponse {
  section: string;
  data: Record<string, unknown>;
}

export interface ConfigSectionUpdateInput {
  data: Record<string, unknown>;
}

export interface ConfigRestartResponse {
  success: boolean;
  message?: string;
}
