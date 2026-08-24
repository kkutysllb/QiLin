import { mcpApi } from '@/lib/api';
import { McpServerGrid } from '@/components/mcp/mcp-server-grid';

export const dynamic = 'force-dynamic';

export default async function McpPage() {
  let servers: Awaited<ReturnType<typeof mcpApi.list>> = [];
  try {
    servers = await mcpApi.list();
  } catch {
    servers = [];
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">MCP</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Model Context Protocol 服务器 — 让 Agent 调用外部工具
        </p>
      </div>
      <McpServerGrid initial={servers} />
    </div>
  );
}
