import { gatewayFetch } from './client';
import type { Thread, ThreadMessage, Paginated } from '@/lib/types';

export const threadsApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<Thread>>('/api/threads', { query: params }),
  get: (thread_id: string) => gatewayFetch<Thread>(`/api/threads/${thread_id}`),
  messages: (thread_id: string, params?: { page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<ThreadMessage>>(`/api/threads/${thread_id}/messages`, { query: params }),
  create: (input: { title?: string; metadata?: Record<string, unknown> }) =>
    gatewayFetch<Thread>('/api/threads', { method: 'POST', body: input }),
  delete: (thread_id: string) =>
    gatewayFetch<void>(`/api/threads/${thread_id}`, { method: 'DELETE' }),
  update: (thread_id: string, input: { title?: string; metadata?: Record<string, unknown> }) =>
    gatewayFetch<Thread>(`/api/threads/${thread_id}`, { method: 'PATCH', body: input })
};
