import { gatewayFetch } from './client';
import type { Run, Paginated } from '@/lib/types';

export interface CreateRunInput {
  thread_id: string;
  input: string;
  agent_name?: string;
  metadata?: Record<string, unknown>;
}

export const runsApi = {
  list: (params?: { thread_id?: string; page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<Run>>('/api/runs', { query: params }),
  get: (run_id: string) => gatewayFetch<Run>(`/api/runs/${run_id}`),
  create: (input: CreateRunInput) =>
    gatewayFetch<Run>('/api/runs', { method: 'POST', body: input }),
  cancel: (run_id: string) =>
    gatewayFetch<Run>(`/api/runs/${run_id}/cancel`, { method: 'POST' }),
  delete: (run_id: string) => gatewayFetch<void>(`/api/runs/${run_id}`, { method: 'DELETE' })
};
