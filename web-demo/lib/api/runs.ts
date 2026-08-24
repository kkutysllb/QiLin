import { gatewayFetch } from './client';
import type { Run, Paginated } from '@/lib/types';

export interface CreateRunInput {
  thread_id: string;
  input: string;
  agent_name?: string;
  metadata?: Record<string, unknown>;
}

export const runsApi = {
  /** 在指定线程下创建一个 run */
  create: (input: CreateRunInput) =>
    gatewayFetch<Run>(`/api/threads/${encodeURIComponent(input.thread_id)}/runs`, {
      method: 'POST',
      body: input
    }),
  /** 列出某个线程的所有 runs */
  list: (params: { thread_id: string; page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<Run>>(
      `/api/threads/${encodeURIComponent(params.thread_id)}/runs`,
      { query: params }
    ),
  /** 获取单个 run 详情 */
  get: (thread_id: string, run_id: string) =>
    gatewayFetch<Run>(
      `/api/threads/${encodeURIComponent(thread_id)}/runs/${encodeURIComponent(run_id)}`
    ),
  /** 取消一个 run */
  cancel: (thread_id: string, run_id: string) =>
    gatewayFetch<Run>(
      `/api/threads/${encodeURIComponent(thread_id)}/runs/${encodeURIComponent(run_id)}/cancel`,
      { method: 'POST' }
    )
};
