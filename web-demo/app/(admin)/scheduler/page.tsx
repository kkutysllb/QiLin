import { setupSsrCookies, schedulerApi } from '@/lib/api/server-fetch';
import { SchedulerClient } from './client';

export const dynamic = 'force-dynamic';

export default async function SchedulerPage() {
  await setupSsrCookies();
  const tasks = await schedulerApi.list().catch(() => []);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">调度</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cron 定时任务管理 — 创建 / 编辑 / 触发 / 暂停(共 {tasks.length} 条)
        </p>
      </div>
      <SchedulerClient initialTasks={tasks} />
    </div>
  );
}
