import { setupSsrCookies, persistenceApi } from '@/lib/api/server-fetch';
import { PersistenceClient } from './client';

export const dynamic = 'force-dynamic';

export default async function PersistencePage() {
  await setupSsrCookies();
  const [status, usage] = await Promise.allSettled([
    persistenceApi.status(),
    persistenceApi.usage()
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">持久化</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          数据库 / Checkpoint / 用户工作区 — 存储后端状态与占用
        </p>
      </div>
      <PersistenceClient
        initialStatus={status.status === 'fulfilled' ? status.value : null}
        initialUsage={usage.status === 'fulfilled' ? usage.value : null}
      />
    </div>
  );
}