import { setupSsrCookies, threadsApi } from '@/lib/api/server-fetch';
import { ThreadsClient } from './client';

export const dynamic = 'force-dynamic';

export default async function ThreadsPage() {
  await setupSsrCookies();
  let threads: Awaited<ReturnType<typeof threadsApi.list>> = [];
  try {
    threads = await threadsApi.list({ limit: 100 });
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error('[threads/page] list failed:', msg);
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">线程</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          所有会话线程(共 {threads.length} 条)
        </p>
      </div>
      <ThreadsClient initial={threads} />
    </div>
  );
}
