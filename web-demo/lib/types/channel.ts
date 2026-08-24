/** Channel subsystem types — 对应 /api/channels/* 端点 */
import type { ID, ISODateString } from './common';

export type ChannelProvider =
  | 'dingtalk'
  | 'discord'
  | 'feishu'
  | 'github'
  | 'slack'
  | 'telegram'
  | 'wechat'
  | 'wecom';

export type ChannelAuthMode = 'oauth' | 'webhook' | 'token' | 'app';

export type ChannelConnectionStatus = 'connected' | 'disconnected' | 'pending' | 'error';

export interface ChannelProviderInfo {
  provider: ChannelProvider | string;
  display_name: string;
  enabled: boolean;
  configured: boolean;
  connectable: boolean;
  unavailable_reason?: string | null;
  auth_mode?: ChannelAuthMode | string;
  connection_status?: ChannelConnectionStatus | string;
  description?: string;
  icon_url?: string;
  credential_fields?: ChannelCredentialField[];
}

export interface ChannelCredentialField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select';
  required: boolean;
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
  help?: string;
}

export interface ChannelProvidersResponse {
  enabled: boolean;
  providers: ChannelProviderInfo[];
}

export interface ChannelRuntimeState {
  enabled: boolean;
  running: boolean;
  error?: string | null;
}

export interface ChannelServiceStatus {
  service_running: boolean;
  channels: Record<string, ChannelRuntimeState>;
}

export interface ChannelConnection {
  id: ID;
  provider: string;
  status: ChannelConnectionStatus;
  external_account_id?: string;
  external_account_name?: string;
  workspace_id?: string;
  workspace_name?: string;
  scopes?: string[];
  created_at: ISODateString;
  updated_at?: ISODateString;
}

export interface ChannelConnectionsResponse {
  connections: ChannelConnection[];
}

export interface ChannelConnectRequest {
  /** 凭证字段值(随 provider 不同) */
  credentials: Record<string, string>;
  /** 可选回调 URL */
  callback_url?: string;
  /** 可选元数据 */
  metadata?: Record<string, unknown>;
}

export interface ChannelConnectResponse {
  provider: string;
  mode: 'oauth' | 'direct';
  /** OAuth 模式:用户去这个 URL 授权 */
  url?: string;
  /** Direct 模式:验证码 */
  code?: string;
  instruction?: string;
  expires_in?: number;
}

export interface ChannelRuntimeConfigPatch {
  values: Record<string, unknown>;
}
