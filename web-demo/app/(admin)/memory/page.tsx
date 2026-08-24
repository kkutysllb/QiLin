import { memoryApi } from '@/lib/api';
import { MemoryClient } from './client';

export const dynamic = 'force-dynamic';

export default async function MemoryPage() {
  const result = await memoryApi
    .list({ page: 1, page_size: 100 })
    .catch(() => ({ items: [] as never[], total: 0, page: 1, page_size: 100 }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">记忆</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          长期记忆事实 — Agent 可在对话中检索(共 {result.total} 条)
        </p>
      </div>
      <MemoryClient initialFacts={result.items} total={result.total} />
    </div>
  );
}
