'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DisplayToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration_ms?: number;
}

const STATUS_ICON = {
  pending: <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-qilin-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />
};

export function ToolCallCard({ toolCall }: { toolCall: DisplayToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border bg-muted/30">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/30"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Wrench className="h-3.5 w-3.5 text-qilin-400" />
        <span className="font-mono text-xs">{toolCall.name}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs">
          {STATUS_ICON[toolCall.status]}
          {toolCall.duration_ms !== undefined && (
            <span className="text-muted-foreground">{toolCall.duration_ms}ms</span>
          )}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t p-3 text-xs">
          <div>
            <div className="mb-1 text-muted-foreground">参数</div>
            <pre className="overflow-x-auto rounded bg-background p-2">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>
          {toolCall.result !== undefined && (
            <div>
              <div className="mb-1 text-muted-foreground">结果</div>
              <pre
                className={cn(
                  'max-h-60 overflow-x-auto rounded bg-background p-2',
                  toolCall.status === 'failed' && 'text-destructive'
                )}
              >
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
