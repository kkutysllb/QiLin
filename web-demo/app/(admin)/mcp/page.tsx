import { setupSsrCookies, mcpApi } from '@/lib/api/server-fetch';
import { McpServerGrid } from '@/components/mcp/mcp-server-grid';
import type { McpServerEntry } from '@/lib/api/mcp';

export const dynamic = 'force-dynamic';

export default async function McpPage() {
  await setupSsrCookies();
  let servers: McpServerEntry[] = [];
  try {
    const config = await mcpApi.getConfig();
    servers = (config.servers ?? []).map((s) => ({
      ...s,
      status: s.status ?? 'unknown'
    }));
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
