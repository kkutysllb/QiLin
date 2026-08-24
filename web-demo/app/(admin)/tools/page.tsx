import { setupSsrCookies, toolsApi } from '@/lib/api/server-fetch';
import { ToolsClient } from './client';
import type { Tool } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ToolsPage() {
  await setupSsrCookies();
  // tools API 路径 /api/tools 是否存在待 OpenAPI 验证 — 当前假设返回 { items: [], total }
  const result = await toolsApi.list().catch(() => ({ items: [] as Tool[], total: 0 }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">工具</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          所有可用工具(builtin / mcp / skill / subagent / community)— 共{' '}
          {result.total ?? result.items.length} 个
        </p>
      </div>
      <ToolsClient initial={result.items} />
    </div>
  );
}
