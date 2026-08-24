import { setupSsrCookies, configApi } from '@/lib/api/server-fetch';
import { ConfigClient } from './client';

export const dynamic = 'force-dynamic';

export default async function ConfigPage() {
  await setupSsrCookies();
  const resp = await configApi.full().catch(() => ({ config: {} as Record<string, unknown> }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">配置</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gateway 全局配置 — 按 section 编辑、YAML 格式、热重载控制
        </p>
      </div>
      <ConfigClient initialConfig={resp.config} />
    </div>
  );
}
