import { gatewayFetch } from './client';
import type { Thread, ThreadMessage, Paginated } from '@/lib/types';

/**
 * 注意:Gateway v2.0.0 的 /api/threads 顶层只有 POST(创建),没有 GET(列表)。
 * 列出全部线程必须用 POST /api/threads/search(空 body 即"全部")。
 */

export const threadsApi = {
  /** 列出线程(用 search 端点,空 body 即"全部") */
  list: (params?: { limit?: number; offset?: number }) =>
    gatewayFetch<Thread[]>('/api/threads/search', {
      method: 'POST',
      body: {
        limit: params?.limit ?? 100,
        offset: params?.offset ?? 0
      }
    }),
  /** 搜索线程(按 metadata/status 过滤) */
  search: (input: { metadata?: Record<string, unknown>; status?: string; limit?: number; offset?: number }) =>
    gatewayFetch<Thread[]>('/api/threads/search', { method: 'POST', body: input }),
  /** 创建新线程 */
  create: (input: { title?: string; metadata?: Record<string, unknown> }) =>
    gatewayFetch<Thread>('/api/threads', { method: 'POST', body: input }),
  /** 删除线程 */
  delete: (thread_id: string) =>
    gatewayFetch<void>(`/api/threads/${encodeURIComponent(thread_id)}`, { method: 'DELETE' }),
  /** 获取单个线程 */
  get: (thread_id: string) =>
    gatewayFetch<Thread>(`/api/threads/${encodeURIComponent(thread_id)}`),
  /** 获取线程消息历史(分页) */
  messages: (thread_id: string, params?: { page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<ThreadMessage>>(
      `/api/threads/${encodeURIComponent(thread_id)}/messages`,
      { query: params }
    ),
  /** 获取线程的所有 runs */
  runs: (thread_id: string, params?: { page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<unknown>>(
      `/api/threads/${encodeURIComponent(thread_id)}/runs`,
      { query: params }
    ),
  /** 更新线程(标题/元数据) */
  update: (thread_id: string, input: { title?: string; metadata?: Record<string, unknown> }) =>
    gatewayFetch<Thread>(`/api/threads/${encodeURIComponent(thread_id)}`, {
      method: 'PATCH',
      body: input
    })
};
