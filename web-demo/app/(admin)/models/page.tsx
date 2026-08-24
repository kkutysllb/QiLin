import { setupSsrCookies, modelsApi } from '@/lib/api/server-fetch';
import { ModelsClient } from './client';

export const dynamic = 'force-dynamic';

export default async function ModelsPage() {
  await setupSsrCookies();
  const resp = await modelsApi.list().catch(() => ({ models: [], token_usage: { enabled: false } }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">模型</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          LLM provider 配置 — 选择 / 编辑 / 删除模型(共 {resp.models.length} 条)
        </p>
      </div>
      <ModelsClient initialModels={resp.models} />
    </div>
  );
}
