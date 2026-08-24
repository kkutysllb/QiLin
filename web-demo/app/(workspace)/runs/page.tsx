import { setupSsrCookies, threadsApi, runsApi } from '@/lib/api/server-fetch';
import { RunsClient } from './client';
import type { Run } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function RunsPage() {
  await setupSsrCookies();
  // Runs 必须按 thread 列出 — 默认汇总所有 thread 的 runs
  const threads = await threadsApi.list({ limit: 100 }).catch(() => []);
  const allRunsResults = await Promise.allSettled(
    threads.map((t) => runsApi.list({ thread_id: t.thread_id, page_size: 100 }))
  );
  // Gateway 的 /api/threads/{id}/runs 返回 Run[] 数组(不是分页包装对象)
  const allRuns: Run[] = allRunsResults
    .filter((r): r is PromiseFulfilledResult<Run[]> => r.status === 'fulfilled')
    .flatMap((r) => r.value);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">运行</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          所有 Agent 运行(汇总自 {threads.length} 个 thread,共 {allRuns.length} 条)
        </p>
      </div>
      <RunsClient initial={allRuns} />
    </div>
  );
}
