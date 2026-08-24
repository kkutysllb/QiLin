import { gatewayFetch } from './client';
import type { Agent } from '@/lib/types';

export const agentsApi = {
  list: () => gatewayFetch<Agent[]>('/api/agents'),
  get: (name: string) => gatewayFetch<Agent>(`/api/agents/${encodeURIComponent(name)}`),
  create: (input: Omit<Agent, 'metadata'> & { metadata?: Record<string, unknown> }) =>
    gatewayFetch<Agent>('/api/agents', { method: 'POST', body: input }),
  update: (name: string, input: Partial<Agent>) =>
    gatewayFetch<Agent>(`/api/agents/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: input
    }),
  delete: (name: string) =>
    gatewayFetch<void>(`/api/agents/${encodeURIComponent(name)}`, { method: 'DELETE' })
};
