'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { McpServerCard } from './mcp-server-card';
import { McpServerDetailDrawer } from './mcp-server-detail-drawer';
import { McpAddDialog } from './mcp-add-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { Plug, Plus } from 'lucide-react';
import { mcpApi } from '@/lib/api';
import type { McpServerEntry } from '@/lib/api/mcp';
import { toast } from 'sonner';

interface Props {
  initial: McpServerEntry[];
}

export function McpServerGrid({ initial }: Props) {
  const [selected, setSelected] = useState<McpServerEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      mcpApi.setServerEnabled(name, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-config'] });
      toast.success('状态已更新');
    },
    onError: (e) => toast.error(`更新失败: ${(e as Error).message}`)
  });

  const refreshMutation = useMutation({
    mutationFn: () => mcpApi.resetCache(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-config'] });
      toast.success('缓存已重置,稍后会自动重新连接');
    },
    onError: (e) => toast.error(`重置失败: ${(e as Error).message}`)
  });

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">MCP 服务器</h2>
          <p className="text-xs text-muted-foreground">通过 Model Context Protocol 接入外部工具</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            重置缓存
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            添加服务器
          </Button>
        </div>
      </div>

      {initial.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="还没有 MCP 服务器"
          description="点击「添加服务器」接入第一个 MCP server(注:添加后需要 Gateway 后端支持 PATCH /api/mcp/config with name)"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {initial.map((s) => (
            <McpServerCard
              key={s.name}
              server={s}
              onSelect={setSelected}
              onToggle={(srv, enabled) => toggleMutation.mutate({ name: srv.name, enabled })}
            />
          ))}
        </div>
      )}

      <McpServerDetailDrawer server={selected} onClose={() => setSelected(null)} />
      <McpAddDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
