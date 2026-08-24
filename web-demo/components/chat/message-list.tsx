'use client';
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageItem, type DisplayMessage } from './message-item';
import { threadsApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';
import { useChatStream } from './use-chat-stream';
import { TokenUsageBar } from './token-usage-bar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Composer } from './composer';

export function MessageList({ threadId }: { threadId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, tokenUsage, isStreaming, send } = useChatStream(threadId);

  const { data: history, isLoading } = useQuery({
    queryKey: ['thread-messages', threadId],
    queryFn: () => threadsApi.messages(threadId, { page: 1, page_size: 50 }).then((r) => r.items),
    refetchInterval: 5000
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const displayMessages: DisplayMessage[] = [...(history ?? []), ...messages];

  return (
    <>
      <ScrollArea className="flex-1 px-4">
        <div className="mx-auto max-w-3xl space-y-6 py-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : displayMessages.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              开始对话吧 — 发送消息以触发 Agent
            </div>
          ) : (
            displayMessages.map((m, i) => (
              <MessageItem
                key={m.id}
                message={m}
                isStreaming={isStreaming && i === displayMessages.length - 1}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      <TokenUsageBar used={tokenUsage.total_tokens} total={8000} />
      <Composer onSend={send} disabled={isStreaming} />
    </>
  );
}
