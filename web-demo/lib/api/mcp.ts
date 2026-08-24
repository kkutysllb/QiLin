import { gatewayFetch } from './client';

/**
 * MCP 真实接口:
 * - Gateway v2.0.0 实际只有 4 个 endpoint
 * - 没有传统的 /servers 概念,而是统一配置
 * - OAuth 通过 /api/v1/auth/oauth/{provider} 处理(不在 mcp 模块)
 */

export interface McpServerEntry {
  name: string;
  url: string;
  enabled: boolean;
  auth?: Record<string, string>;
  tools_count?: number;
  status?: 'connected' | 'disconnected' | 'error' | 'unknown';
}

export interface McpConfig {
  servers: McpServerEntry[];
  cache_ttl_seconds?: number;
}

export const mcpApi = {
  /** 获取 MCP 配置(含所有服务器) */
  getConfig: () => gatewayFetch<McpConfig>('/api/mcp/config'),
  /** 整体替换 MCP 配置 */
  updateConfig: (config: McpConfig) =>
    gatewayFetch<McpConfig>('/api/mcp/config', { method: 'PUT', body: config }),
  /** 仅更新某个服务器的状态(启用/禁用) */
  setServerEnabled: (name: string, enabled: boolean) =>
    gatewayFetch<McpConfig>('/api/mcp/config', {
      method: 'PATCH',
      body: { name, enabled }
    }),
  /** 清除 MCP 工具缓存,触发重新加载 */
  resetCache: () => gatewayFetch<{ reset: boolean }>('/api/mcp/cache/reset', { method: 'POST' })
};
