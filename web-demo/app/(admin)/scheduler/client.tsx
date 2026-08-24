'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { schedulerApi } from '@/lib/api';
import type { ScheduledTask, ScheduledTaskCreateInput } from '@/lib/types/scheduler';
import {
  Clock,
  Plus,
  Play,
  Pause,
  Trash2,
  Pencil
} from 'lucide-react';

interface Props {
  initialTasks: ScheduledTask[];
}

export function SchedulerClient({ initialTasks }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新建任务
            </Button>
          </DialogTrigger>
          <TaskFormDialog
            onClose={() => setCreateOpen(false)}
            onSuccess={() => {
              setCreateOpen(false);
              router.refresh();
            }}
          />
        </Dialog>
      </div>

      {initialTasks.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="暂无定时任务"
          description={'点上面的「新建任务」创建你的第一个 cron 任务'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {initialTasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: ScheduledTask }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const handleAction = async (
    action: () => Promise<unknown>,
    successMsg: string
  ) => {
    setBusy(true);
    try {
      await action();
      toast.success(successMsg);
      router.refresh();
    } catch (e) {
      toast.error(`失败: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const status = task.status ?? (task.enabled === false ? 'paused' : 'active');
  const isPaused = status === 'paused';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{task.name}</CardTitle>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {task.cron} {task.timezone && `(${task.timezone})`}
            </p>
          </div>
          <Badge variant={isPaused ? 'outline' : 'success'}>{status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {task.agent_name && (
            <Badge variant="secondary">agent: {task.agent_name}</Badge>
          )}
          {task.next_run_at && (
            <span className="text-muted-foreground">
              下次: {new Date(task.next_run_at).toLocaleString()}
            </span>
          )}
          {task.last_run_at && (
            <span className="text-muted-foreground">
              上次: {new Date(task.last_run_at).toLocaleString()}
            </span>
          )}
        </div>
        {task.description && (
          <p className="text-xs text-muted-foreground">{task.description}</p>
        )}
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditOpen(true)}
            disabled={busy}
          >
            <Pencil className="mr-1 h-3 w-3" />
            编辑
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              handleAction(() => schedulerApi.trigger(task.id), `已触发 ${task.name}`)
            }
            disabled={busy}
          >
            <Play className="mr-1 h-3 w-3" />
            触发
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              handleAction(
                () => (isPaused ? schedulerApi.resume(task.id) : schedulerApi.pause(task.id)),
                isPaused ? `已恢复 ${task.name}` : `已暂停 ${task.name}`
              )
            }
            disabled={busy}
          >
            {isPaused ? (
              <>
                <Play className="mr-1 h-3 w-3" />
                恢复
              </>
            ) : (
              <>
                <Pause className="mr-1 h-3 w-3" />
                暂停
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              handleAction(() => schedulerApi.delete(task.id), `已删除 ${task.name}`)
            }
            disabled={busy}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            删除
          </Button>
        </div>
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <TaskFormDialog
          initial={task}
          onClose={() => setEditOpen(false)}
          onSuccess={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      </Dialog>
    </Card>
  );
}

function TaskFormDialog({
  initial,
  onClose,
  onSuccess
}: {
  initial?: ScheduledTask;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [cron, setCron] = useState(initial?.cron ?? '0 0 * * *');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [agentName, setAgentName] = useState(initial?.agent_name ?? '');
  const [inputJson, setInputJson] = useState(
    initial?.input ? JSON.stringify(initial.input, null, 2) : '{}'
  );
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let input: Record<string, unknown> | undefined;
      try {
        input = inputJson.trim() ? JSON.parse(inputJson) : undefined;
      } catch {
        throw new Error('input 不是合法 JSON');
      }
      const payload: ScheduledTaskCreateInput = {
        name,
        cron,
        description: description || undefined,
        agent_name: agentName || undefined,
        input,
        enabled: initial?.enabled ?? true
      };
      if (initial) {
        await schedulerApi.update(initial.id, payload);
        toast.success(`已更新 ${name}`);
      } else {
        await schedulerApi.create(payload);
        toast.success(`已创建 ${name}`);
      }
      onSuccess();
    } catch (e) {
      toast.error(`失败: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑任务' : '新建任务'}</DialogTitle>
          <DialogDescription>
            Cron 表达式(如 "0 0 * * *" 表示每天 0 点)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="name">名称</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="daily-cleanup"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cron">Cron 表达式</Label>
          <Input
            id="cron"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            required
            className="font-mono"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent">Agent (可选)</Label>
          <Input
            id="agent"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="lead_agent"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="input">Input (JSON)</Label>
          <Textarea
            id="input"
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            rows={4}
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="desc">描述 (可选)</Label>
          <Input
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? '提交中...' : initial ? '保存' : '创建'}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
