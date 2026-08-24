'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';
import type { MemoryFact } from '@/lib/api/memory';

export function MemoryFactDetailDrawer({
  fact,
  onClose
}: {
  fact: MemoryFact | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!fact} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-base">事实详情</DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{fact?.category}</Badge>
            <span>{fact && formatDateTime(fact.created_at)}</span>
          </div>
        </DialogHeader>
        {fact && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">内容</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{fact.content}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">置信度</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-qilin-500"
                      style={{ width: `${fact.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{(fact.confidence * 100).toFixed(1)}%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
