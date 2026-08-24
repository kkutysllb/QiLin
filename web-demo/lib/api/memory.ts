import { gatewayFetch } from './client';
import type { Paginated } from '@/lib/types';

export interface MemoryFact {
  id: string;
  content: string;
  category: string;
  confidence: number;
  created_at: string;
}

export const memoryApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<MemoryFact>>('/api/memory/facts', { query: params }),
  search: (q: string) =>
    gatewayFetch<MemoryFact[]>(`/api/memory/search?q=${encodeURIComponent(q)}`),
  create: (input: { content: string; category?: string; confidence?: number }) =>
    gatewayFetch<MemoryFact>('/api/memory/facts', { method: 'POST', body: input }),
  delete: (id: string) =>
    gatewayFetch<void>(`/api/memory/facts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reload: () => gatewayFetch<{ reloaded: number }>('/api/memory/reload', { method: 'POST' }),
  clear: () => gatewayFetch<void>('/api/memory/clear', { method: 'POST' })
};
