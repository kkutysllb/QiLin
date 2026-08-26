import { setupSsrCookies, integrationsApi } from '@/lib/api/server-fetch';
import { IntegrationsClient } from './client';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  await setupSsrCookies();
  const status = await integrationsApi.status().catch(() => null);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">集成</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          第三方系统集成 — 当前支持 Lark / 飞书
        </p>
      </div>
      <IntegrationsClient initialStatus={status} />
    </div>
  );
}