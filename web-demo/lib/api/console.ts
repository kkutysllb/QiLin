import { gatewayFetch } from './client';
import type {
  ConsoleRunEntry,
  ConsoleRunsResponse,
  ConsoleStats,
  ConsoleUsage,
  WorkspaceChange
} from '@/lib/types/console';

/**
 * Console/Tracing API — 运行统计与观测
 *
 * 关键端点:
 * - GET /api/console/runs    最近 runs(响应 { runs: [], has_more })
 * - GET /api/console/stats   聚合统计
 * - GET /api/console/usage   按日 / 按 model 用量
 * - GET /api/threads/{thread_id}/runs/{run_id}/workspace-changes  文件变更
 * - GET /api/threads/{thread_id}/runs/{run_id}/events              run 事件流
 */
export const consoleApi = {
  runs: (params?: { limit?: number; offset?: number }) =>
    gatewayFetch<ConsoleRunsResponse>('/api/console/runs', { query: params }),
  stats: () => gatewayFetch<ConsoleStats>('/api/console/stats'),
  usage: () => gatewayFetch<ConsoleUsage>('/api/console/usage'),
  /** 获取某个 run 的工作区文件变更 */
  workspaceChanges: (thread_id: string, run_id: string) =>
    gatewayFetch<WorkspaceChange[]>(
      `/api/threads/${encodeURIComponent(thread_id)}/runs/${encodeURIComponent(run_id)}/workspace-changes`
    ),
  /** 获取某个 run 的事件流 */
  runEvents: (thread_id: string, run_id: string) =>
    gatewayFetch<unknown[]>(
      `/api/threads/${encodeURIComponent(thread_id)}/runs/${encodeURIComponent(run_id)}/events`
    )
};
