'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import type { Run } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function RunDetailDrawer({ run, onClose }: { run: Run | null; onClose: () => void }) {
  return (
    <Dialog open={!!run} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run {run?.run_id.slice(0, 16)}…</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{run?.agent_name}</Badge>
            <span>{run && formatDateTime(run.created_at)}</span>
          </div>
        </DialogHeader>
        {run && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">状态</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge>{run.status}</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Token 用量</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground">Input</div>
                  <div>{run.input_tokens ?? '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Output</div>
                  <div>{run.output_tokens ?? '—'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Total</div>
                  <div>{run.total_tokens ?? '—'}</div>
                </div>
              </CardContent>
            </Card>
            {run.error && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-destructive">错误</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs">{run.error}</pre>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
