import { threadsApi } from '@/lib/api';
import { ThreadsClient } from './client';

export const dynamic = 'force-dynamic';

export default async function ThreadsPage() {
  const result = await threadsApi
    .list({ page: 1, page_size: 100 })
    .catch(() => ({ items: [] as never[], total: 0, page: 1, page_size: 100 }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">线程</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          所有会话线程(共 {result.total} 条)
        </p>
      </div>
      <ThreadsClient initial={result.items} />
    </div>
  );
}
