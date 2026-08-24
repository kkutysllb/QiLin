'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { threadsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Loader2, Trash2, MessageSquare } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import { cn, formatRelativeTime } from '@/lib/utils';

export function ThreadListPanel() {
  const router = useRouter();
  const params = useParams<{ thread_id?: string }>();
  const queryClient = useQueryClient();
  const activeId = params.thread_id;

  const { data: threads = [], isLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: () => threadsApi.list({ limit: 50 })
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => threadsApi.delete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      toast.success('线程已删除');
      if (id === activeId) router.push('/chat');
    },
    onError: (e) => toast.error(`删除失败: ${(e as Error).message}`)
  });

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r bg-card/30">
      <div className="border-b p-3">
        <Button className="w-full" onClick={() => router.push('/chat')}>
          <Plus className="mr-2 h-4 w-4" />新对话
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : threads.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">还没有对话</div>
        ) : (
          <div className="space-y-1 p-2">
            {threads.map((t) => (
              <div
                key={t.thread_id}
                onClick={() => router.push(`/chat/${t.thread_id}`)}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent/50',
                  t.thread_id === activeId && 'bg-accent text-accent-foreground'
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">
                    {t.title ?? t.thread_id.slice(0, 16)}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {formatRelativeTime(t.updated_at)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('删除此线程?')) deleteMutation.mutate(t.thread_id);
                  }}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="删除"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
