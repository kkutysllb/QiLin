import { AppShell } from '@/components/layout/app-shell';
import { OverviewStats, DEFAULT_STATS, type Stat } from '@/components/home/overview-stats';
import { ActivityFeed, type ActivityItem } from '@/components/home/activity-feed';
import { threadsApi, runsApi, skillsApi, modelsApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [threads, runs, skills, models] = await Promise.allSettled([
    threadsApi.list({ page: 1, page_size: 1 }),
    runsApi.list({ page: 1, page_size: 1 }),
    skillsApi.list({ page: 1, page_size: 100 }),
    modelsApi.list()
  ]);

  const stats: Stat[] = [
    {
      ...DEFAULT_STATS[0],
      value: threads.status === 'fulfilled' ? threads.value.total : '—'
    },
    {
      ...DEFAULT_STATS[1],
      value: runs.status === 'fulfilled' ? runs.value.total : '—'
    },
    {
      ...DEFAULT_STATS[2],
      value:
        skills.status === 'fulfilled'
          ? skills.value.items.filter((s) => s.enabled).length
          : '—'
    },
    { ...DEFAULT_STATS[3], value: models.status === 'fulfilled' ? models.value.length : '—' }
  ];

  const recentThreads: ActivityItem[] =
    threads.status === 'fulfilled'
      ? threads.value.items.slice(0, 5).map((t) => ({
          id: t.thread_id,
          type: 'thread' as const,
          title: t.title ?? t.thread_id,
          timestamp: t.updated_at
        }))
      : [];

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">总览</h1>
        <p className="mt-1 text-sm text-muted-foreground">QiLin 引擎实时运行状态</p>
      </div>
      <div className="space-y-6">
        <OverviewStats stats={stats} />
        <ActivityFeed items={recentThreads} />
      </div>
    </AppShell>
  );
}
