import { gatewayFetch } from './client';

export interface McpServer {
  name: string;
  url: string;
  enabled: boolean;
  tools_count: number;
  status: 'connected' | 'disconnected' | 'error';
}

export const mcpApi = {
  list: () => gatewayFetch<McpServer[]>('/api/mcp/servers'),
  get: (name: string) =>
    gatewayFetch<McpServer>(`/api/mcp/servers/${encodeURIComponent(name)}`),
  add: (input: { name: string; url: string; auth?: Record<string, string> }) =>
    gatewayFetch<McpServer>('/api/mcp/servers', { method: 'POST', body: input }),
  remove: (name: string) =>
    gatewayFetch<void>(`/api/mcp/servers/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    }),
  setEnabled: (name: string, enabled: boolean) =>
    gatewayFetch<McpServer>(`/api/mcp/servers/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: { enabled }
    }),
  refresh: (name: string) =>
    gatewayFetch<McpServer>(`/api/mcp/servers/${encodeURIComponent(name)}/refresh`, {
      method: 'POST'
    })
};
