import { runsApi } from '@/lib/api';
import { RunsClient } from './client';

export const dynamic = 'force-dynamic';

export default async function RunsPage() {
  const result = await runsApi
    .list({ page: 1, page_size: 100 })
    .catch(() => ({ items: [] as never[], total: 0, page: 1, page_size: 100 }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">运行</h1>
        <p className="mt-1 text-sm text-muted-foreground">所有 Agent 运行(共 {result.total} 条)</p>
      </div>
      <RunsClient initial={result.items} />
    </div>
  );
}
