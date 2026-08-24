'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MemoryStats } from '@/components/memory/memory-stats';
import { MemoryFactsTable } from '@/components/memory/memory-facts-table';
import { MemoryFactDetailDrawer } from '@/components/memory/memory-fact-detail-drawer';
import { MemorySearchPanel } from '@/components/memory/memory-search-panel';
import { MemoryCreateDialog } from '@/components/memory/memory-create-dialog';
import { Plus, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { memoryApi } from '@/lib/api';
import type { MemoryFact } from '@/lib/api/memory';
import { toast } from 'sonner';

interface Props {
  initialFacts: MemoryFact[];
  total: number;
}

export function MemoryClient({ initialFacts, total }: Props) {
  const [selected, setSelected] = useState<MemoryFact | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();

  // 计算 stats
  const stats = {
    total_facts: total,
    avg_confidence:
      initialFacts.length > 0
        ? initialFacts.reduce((s, f) => s + f.confidence, 0) / initialFacts.length
        : 0,
    by_category: initialFacts.reduce(
      (acc, f) => {
        acc[f.category] = (acc[f.category] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
    recent_24h: initialFacts.filter((f) => {
      const created = new Date(f.created_at).getTime();
      return Date.now() - created < 24 * 60 * 60 * 1000;
    }).length
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => memoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-facts'] });
      toast.success('事实已删除');
    },
    onError: (e) => toast.error(`删除失败: ${(e as Error).message}`)
  });

  const reloadMutation = useMutation({
    mutationFn: () => memoryApi.reload(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-facts'] });
      toast.success('记忆已重载');
    }
  });

  const clearMutation = useMutation({
    mutationFn: () => memoryApi.clear(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memory-facts'] });
      toast.success('记忆已清空');
    },
    onError: (e) => toast.error(`清空失败: ${(e as Error).message}`)
  });

  return (
    <>
      <MemoryStats stats={stats} />
      <MemorySearchPanel />
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-medium">事实列表</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => reloadMutation.mutate()}
                disabled={reloadMutation.isPending}
              >
                {reloadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                重载
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm('确定清空所有记忆?此操作不可恢复。')) clearMutation.mutate();
                }}
                disabled={clearMutation.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
                清空
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                新建事实
              </Button>
            </div>
          </div>
          <MemoryFactsTable
            data={initialFacts}
            onDelete={(f) => deleteMutation.mutate(f.id)}
            onSelect={setSelected}
          />
        </CardContent>
      </Card>
      <MemoryFactDetailDrawer fact={selected} onClose={() => setSelected(null)} />
      <MemoryCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
