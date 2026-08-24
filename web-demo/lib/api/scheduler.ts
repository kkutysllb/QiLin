import { gatewayFetch } from './client';
import type {
  ScheduledTask,
  ScheduledTaskCreateInput,
  ScheduledTaskRun,
  ScheduledTaskUpdateInput
} from '@/lib/types/scheduler';

/**
 * Scheduler API — Cron 定时任务管理
 *
 * 关键端点:
 * - GET    /api/scheduled-tasks            列出所有任务
 * - POST   /api/scheduled-tasks            新建任务
 * - GET    /api/scheduled-tasks/{task_id}  任务详情
 * - PATCH  /api/scheduled-tasks/{task_id}  更新任务
 * - DELETE /api/scheduled-tasks/{task_id}  删除任务
 * - POST   /api/scheduled-tasks/{task_id}/pause    暂停
 * - POST   /api/scheduled-tasks/{task_id}/resume   恢复
 * - POST   /api/scheduled-tasks/{task_id}/trigger  手动触发
 * - GET    /api/scheduled-tasks/{task_id}/runs     运行历史
 */
export const schedulerApi = {
  /** 列出所有定时任务 */
  list: () => gatewayFetch<ScheduledTask[]>('/api/scheduled-tasks'),
  /** 任务详情 */
  get: (taskId: string) =>
    gatewayFetch<ScheduledTask>(`/api/scheduled-tasks/${encodeURIComponent(taskId)}`),
  /** 新建任务 */
  create: (input: ScheduledTaskCreateInput) =>
    gatewayFetch<ScheduledTask>('/api/scheduled-tasks', { method: 'POST', body: input }),
  /** 更新任务 */
  update: (taskId: string, input: ScheduledTaskUpdateInput) =>
    gatewayFetch<ScheduledTask>(
      `/api/scheduled-tasks/${encodeURIComponent(taskId)}`,
      { method: 'PATCH', body: input }
    ),
  /** 删除任务 */
  delete: (taskId: string) =>
    gatewayFetch<void>(`/api/scheduled-tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE'
    }),
  /** 暂停任务 */
  pause: (taskId: string) =>
    gatewayFetch<{ success: boolean }>(
      `/api/scheduled-tasks/${encodeURIComponent(taskId)}/pause`,
      { method: 'POST' }
    ),
  /** 恢复任务 */
  resume: (taskId: string) =>
    gatewayFetch<{ success: boolean }>(
      `/api/scheduled-tasks/${encodeURIComponent(taskId)}/resume`,
      { method: 'POST' }
    ),
  /** 手动触发 */
  trigger: (taskId: string) =>
    gatewayFetch<{ run_id?: string }>(
      `/api/scheduled-tasks/${encodeURIComponent(taskId)}/trigger`,
      { method: 'POST' }
    ),
  /** 任务运行历史 */
  runs: (taskId: string) =>
    gatewayFetch<ScheduledTaskRun[]>(
      `/api/scheduled-tasks/${encodeURIComponent(taskId)}/runs`
    )
};
