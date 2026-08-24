import { gatewayFetch } from './client';
import type {
  ChannelConnectRequest,
  ChannelConnectResponse,
  ChannelConnection,
  ChannelConnectionsResponse,
  ChannelProviderInfo,
  ChannelProvidersResponse,
  ChannelRuntimeConfigPatch,
  ChannelServiceStatus
} from '@/lib/types/channel';

/**
 * Channels API — 8 大外部渠道(钉钉/Discord/飞书/GitHub/Slack/Telegram/微信/企业微信)
 *
 * 关键端点:
 * - GET    /api/channels/providers     列出所有 provider + 配置状态
 * - GET    /api/channels/              列出所有 runtime channel 状态
 * - GET    /api/channels/connections   已建立的连接(用户授权)
 * - DELETE /api/channels/connections/{id}  断开连接
 * - POST   /api/channels/{name}/restart 重启单个 channel
 * - POST   /api/channels/{provider}/connect  OAuth / 直接连接
 * - GET    /api/channels/{provider}/runtime-config  读取 provider runtime 配置
 * - POST   /api/channels/{provider}/runtime-config  写入 provider runtime 配置
 * - DELETE /api/channels/{provider}/runtime-config  清空
 */
export const channelsApi = {
  /** 列出所有 provider(8 个固定 provider + 详细配置状态) */
  providers: () => gatewayFetch<ChannelProvidersResponse>('/api/channels/providers'),
  /** 获取 channel service 整体状态(service_running + 各 provider enabled/running) */
  serviceStatus: () => gatewayFetch<ChannelServiceStatus>('/api/channels/'),
  /** 列出所有连接 */
  listConnections: () => gatewayFetch<ChannelConnectionsResponse>('/api/channels/connections'),
  /** 删除单个连接 */
  deleteConnection: (connectionId: string) =>
    gatewayFetch<void>(`/api/channels/connections/${encodeURIComponent(connectionId)}`, {
      method: 'DELETE'
    }),
  /** 重启某个 channel(provider name) */
  restart: (name: string) =>
    gatewayFetch<{ success: boolean; message?: string }>(
      `/api/channels/${encodeURIComponent(name)}/restart`,
      { method: 'POST' }
    ),
  /** 发起 OAuth 连接(返回 authorization URL 或直接绑定) */
  connect: (provider: string, input: ChannelConnectRequest) =>
    gatewayFetch<ChannelConnectResponse>(
      `/api/channels/${encodeURIComponent(provider)}/connect`,
      { method: 'POST', body: input }
    ),
  /** 读取 provider runtime config */
  getRuntimeConfig: (provider: string) =>
    gatewayFetch<{ values: Record<string, unknown> }>(
      `/api/channels/${encodeURIComponent(provider)}/runtime-config`
    ),
  /** 写入 provider runtime config(动态调整 channel 行为,无需重启) */
  setRuntimeConfig: (provider: string, values: Record<string, unknown>) =>
    gatewayFetch<ChannelRuntimeConfigPatch>(
      `/api/channels/${encodeURIComponent(provider)}/runtime-config`,
      { method: 'POST', body: { values } }
    ),
  /** 清空 provider runtime config(恢复默认) */
  resetRuntimeConfig: (provider: string) =>
    gatewayFetch<void>(`/api/channels/${encodeURIComponent(provider)}/runtime-config`, {
      method: 'DELETE'
    })
};

export type { ChannelProviderInfo };
