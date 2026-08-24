'use client';
import { Bot, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export interface DisplaySubagent {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  steps?: number;
  current_step?: string;
  result?: string;
  error?: string;
}

export function SubagentCard({ subagent }: { subagent: DisplaySubagent }) {
  const Icon =
    subagent.status === 'running'
      ? Loader2
      : subagent.status === 'completed'
        ? CheckCircle2
        : XCircle;
  const color =
    subagent.status === 'running'
      ? 'text-amber-400'
      : subagent.status === 'completed'
        ? 'text-qilin-400'
        : 'text-destructive';

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <Bot className="h-4 w-4 text-purple-400" />
        <span className="font-medium">SubAgent: {subagent.name}</span>
        <Icon
          className={`ml-auto h-4 w-4 ${color} ${subagent.status === 'running' ? 'animate-spin' : ''}`}
        />
      </div>
      {subagent.status === 'running' && (
        <div className="space-y-1">
          {subagent.current_step && (
            <div className="text-xs text-muted-foreground">{subagent.current_step}</div>
          )}
          <Progress
            value={subagent.steps ? Math.min(100, (subagent.steps / 50) * 100) : 30}
            className="h-1"
          />
        </div>
      )}
      {subagent.status === 'completed' && subagent.result && (
        <pre className="mt-1 max-h-32 overflow-y-auto rounded bg-background p-2 text-xs">
          {subagent.result}
        </pre>
      )}
      {subagent.status === 'failed' && subagent.error && (
        <pre className="mt-1 rounded bg-destructive/10 p-2 text-xs text-destructive">
          {subagent.error}
        </pre>
      )}
    </div>
  );
}
