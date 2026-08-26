import { setupSsrCookies, consoleApi } from '@/lib/api/server-fetch';
import { TracingClient } from './client';

export const dynamic = 'force-dynamic';

export default async function TracingPage() {
  await setupSsrCookies();
  const [stats, runs, usage] = await Promise.allSettled([
    consoleApi.stats(),
    consoleApi.runs({ limit: 20 }),
    consoleApi.usage()
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">追踪</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Console 观测 — 运行统计 / token 用量 / 时间序列
        </p>
      </div>
      <TracingClient
        initialStats={stats.status === 'fulfilled' ? stats.value : null}
        initialRuns={runs.status === 'fulfilled' ? runs.value : null}
        initialUsage={usage.status === 'fulfilled' ? usage.value : null}
      />
    </div>
  );
}