'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { McpServerCard } from './mcp-server-card';
import { McpServerDetailDrawer } from './mcp-server-detail-drawer';
import { McpAddDialog } from './mcp-add-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { Plug, Plus, Loader2 } from 'lucide-react';
import { mcpApi } from '@/lib/api';
import type { McpServer } from '@/lib/api/mcp';
import { toast } from 'sonner';

export function McpServerGrid({ initial }: { initial: McpServer[] }) {
  const [selected, setSelected] = useState<McpServer | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      mcpApi.setEnabled(name, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      toast.success('状态已更新');
    },
    onError: (e) => toast.error(`更新失败: ${(e as Error).message}`)
  });

  const refreshMutation = useMutation({
    mutationFn: (name: string) => mcpApi.refresh(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      toast.success('已刷新');
    },
    onError: (e) => toast.error(`刷新失败: ${(e as Error).message}`)
  });

  const removeMutation = useMutation({
    mutationFn: (name: string) => mcpApi.remove(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] });
      toast.success('服务器已移除');
    },
    onError: (e) => toast.error(`移除失败: ${(e as Error).message}`)
  });

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">MCP 服务器</h2>
          <p className="text-xs text-muted-foreground">通过 Model Context Protocol 接入外部工具</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          添加服务器
        </Button>
      </div>

      {initial.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="还没有 MCP 服务器"
          description="点击「添加服务器」接入第一个 MCP server"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {initial.map((s) => (
            <McpServerCard
              key={s.name}
              server={s}
              onSelect={setSelected}
              onToggle={(srv, enabled) => toggleMutation.mutate({ name: srv.name, enabled })}
              onRefresh={(srv) => refreshMutation.mutate(srv.name)}
              onRemove={(srv) => {
                if (confirm(`确定移除 MCP 服务器 "${srv.name}"?`)) removeMutation.mutate(srv.name);
              }}
            />
          ))}
        </div>
      )}

      <McpServerDetailDrawer server={selected} onClose={() => setSelected(null)} />
      <McpAddDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
