'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toolsApi } from '@/lib/api';
import { ToolsTable } from '@/components/tools/tools-table';
import { ToolDetailDrawer } from '@/components/tools/tool-detail-drawer';
import { EmptyState } from '@/components/shared/empty-state';
import { Wrench } from 'lucide-react';
import { toast } from 'sonner';
import type { Tool } from '@/lib/types';

export function ToolsClient({ initial }: { initial: Tool[] }) {
  const [selected, setSelected] = useState<Tool | null>(null);
  const queryClient = useQueryClient();
  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      toolsApi.setEnabled(name, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      toast.success('工具状态已更新');
    },
    onError: (e) => toast.error(`更新失败: ${(e as Error).message}`)
  });
  return (
    <>
      {initial.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="还没有可用工具"
          description="连接 MCP 服务器或启用技能后,工具会显示在这里"
        />
      ) : (
        <ToolsTable
          data={initial}
          onSelect={setSelected}
          onToggle={(t, enabled) => toggleMutation.mutate({ name: t.name, enabled })}
        />
      )}
      <ToolDetailDrawer tool={selected} onClose={() => setSelected(null)} />
    </>
  );
}
