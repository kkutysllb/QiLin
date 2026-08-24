import { gatewayFetch } from './client';
import type { Tool, Paginated } from '@/lib/types';

export const toolsApi = {
  list: (params?: { source?: string; enabled?: boolean; page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<Tool>>('/api/tools', { query: params }),
  get: (name: string) =>
    gatewayFetch<Tool>(`/api/tools/${encodeURIComponent(name)}`),
  setEnabled: (name: string, enabled: boolean) =>
    gatewayFetch<Tool>(`/api/tools/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: { enabled }
    })
};
