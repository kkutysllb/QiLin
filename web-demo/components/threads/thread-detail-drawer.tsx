'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, formatRelativeTime } from '@/lib/utils';
import type { Thread, ThreadMessage } from '@/lib/types';
import { useEffect, useState } from 'react';
import { threadsApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export function ThreadDetailDrawer({
  thread,
  onClose
}: {
  thread: Thread | null;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!thread) {
      setMessages([]);
      return;
    }
    setLoading(true);
    threadsApi
      .messages(thread.thread_id, { page: 1, page_size: 50 })
      .then((r) => setMessages(r.items))
      .finally(() => setLoading(false));
  }, [thread]);

  return (
    <Dialog open={!!thread} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{thread?.title ?? thread?.thread_id}</DialogTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{thread?.thread_id}</Badge>
            <span>{thread && formatRelativeTime(thread.updated_at)}</span>
            {thread && <span>· 创建于 {formatDateTime(thread.created_at)}</span>}
          </div>
        </DialogHeader>
        <ScrollArea className="h-[calc(100vh-200px)] pr-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无消息</div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <div key={m.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant={m.role === 'user' ? 'default' : 'secondary'}>{m.role}</Badge>
                    <span className="text-muted-foreground">{formatDateTime(m.created_at)}</span>
                  </div>
                  <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
