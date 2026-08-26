/** Integration subsystem types — 对应 /api/integrations/lark/* 端点 */

export interface LarkIntegrationStatus {
  installed: boolean;
  version?: string | null;
  manifest_version?: string | null;
  latest_available_version?: string | null;
  runtime_version_mismatch?: boolean;
  app_configured: boolean;
  app_id?: string | null;
  app_brand?: string | null;
  skills_expected?: number;
  skills_installed?: number;
  installed_skills?: string[];
  enabled_skills?: string[];
  install_path?: string;
  cli?: {
    available: boolean;
    path?: string;
    version?: string;
    error?: string | null;
  };
  message?: string;
  [k: string]: unknown;
}

export interface LarkAuthStartRequest {
  recommend?: boolean;
  domains?: string[];
  scope?: string;
}

export interface LarkAuthStartResponse {
  verification_url: string;
  device_code: string;
  expires_in: number;
  interval?: number;
  user_code?: string;
}

export interface LarkAuthCompleteRequest {
  device_code: string;
  wait_timeout_seconds?: number;
}

export interface LarkAuthCompleteResponse {
  success: boolean;
  message: string;
  status?: LarkIntegrationStatus;
}

export interface LarkConfigStartRequest {
  brand: string;
}

export interface LarkConfigStartResponse {
  verification_url: string;
  device_code: string;
  expires_in: number;
  interval?: number;
  user_code?: string;
  brand?: string;
}

export interface LarkConfigCompleteRequest {
  device_code: string;
  brand: string;
  interval?: number;
  expires_in?: number;
}

export interface LarkConfigCompleteResponse {
  success: boolean;
  message: string;
  status?: LarkIntegrationStatus;
}

export interface LarkInstallResponse {
  success: boolean;
  message: string;
  status?: LarkIntegrationStatus;
}
