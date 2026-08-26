'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { consoleApi } from '@/lib/api';
import type { WorkspaceChange } from '@/lib/types/console';
import {
  FileEdit,
  Search,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  FileQuestion,
  Clock
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

const KIND_LABELS: Record<WorkspaceChange['kind'], { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline'; icon: typeof Plus }> = {
  added: { label: 'added', variant: 'success', icon: Plus },
  modified: { label: 'modified', variant: 'warning', icon: Pencil },
  deleted: { label: 'deleted', variant: 'destructive', icon: Trash2 },
  renamed: { label: 'renamed', variant: 'outline', icon: FileQuestion }
};

export function WorkspaceChangesClient() {
  const [threadId, setThreadId] = useState('');
  const [runId, setRunId] = useState('');
  const [changes, setChanges] = useState<WorkspaceChange[] | null>(null);
  const [busy, setBusy] = useState(false);

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadId.trim() || !runId.trim()) {
      toast.error('需要填写 thread_id 和 run_id');
      return;
    }
    setBusy(true);
    try {
      const data = await consoleApi.workspaceChanges(threadId.trim(), runId.trim());
      setChanges(data);
    } catch (e) {
      toast.error(`查询失败: ${(e as Error).message}`);
      setChanges(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">查询 Run 工作区变更</CardTitle>
          <CardDescription className="text-xs">
            输入 thread_id 和 run_id — 从 Threads/Runs 页复制 ID
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleQuery} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[260px] space-y-1">
              <Label htmlFor="thread" className="text-xs">Thread ID</Label>
              <Input
                id="thread"
                value={threadId}
                onChange={(e) => setThreadId(e.target.value)}
                placeholder="5df6381e-bc9e-4a9d-8457-..."
                className="font-mono text-xs"
              />
            </div>
            <div className="flex-1 min-w-[260px] space-y-1">
              <Label htmlFor="run" className="text-xs">Run ID</Label>
              <Input
                id="run"
                value={runId}
                onChange={(e) => setRunId(e.target.value)}
                placeholder="run-uuid"
                className="font-mono text-xs"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              查询
            </Button>
          </form>
        </CardContent>
      </Card>

      {changes === null ? (
        <EmptyState
          icon={FileEdit}
          title="输入 thread_id + run_id 开始"
          description="Run 完成后,沙箱工作区的所有文件变更会记录在这里"
        />
      ) : changes.length === 0 ? (
        <EmptyState
          icon={FileEdit}
          title="无工作区变更"
          description="该 Run 未对工作区做任何修改"
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {changes.length} 项变更
            </CardTitle>
            <CardDescription className="text-xs">
              run_id {runId.slice(0, 16)}…
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {changes.map((c, i) => {
              const meta = KIND_LABELS[c.kind] ?? KIND_LABELS.modified;
              const Icon = meta.icon;
              return (
                <div key={`${c.path}-${i}`} className="rounded-md border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={meta.variant} className="text-[10px]">
                            {meta.label}
                          </Badge>
                          <code className="truncate font-mono text-xs">{c.path}</code>
                        </div>
                        {c.old_path && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            ← <code className="font-mono">{c.old_path}</code>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      {c.size_bytes != null && <p>{c.size_bytes} B</p>}
                      {c.timestamp && (
                        <p className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(c.timestamp)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}