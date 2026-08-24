import { toolsApi } from '@/lib/api';
import { ToolsClient } from './client';
import type { Tool } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ToolsPage() {
  const result = await toolsApi
    .list({ page: 1, page_size: 200 })
    .catch(() => ({ items: [] as Tool[], total: 0, page: 1, page_size: 200 }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">工具</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          所有可用工具(builtin / mcp / skill / subagent / community)— 共 {result.total} 个
        </p>
      </div>
      <ToolsClient initial={result.items} />
    </div>
  );
}
