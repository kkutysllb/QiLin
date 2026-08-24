'use client';
import { useState } from 'react';
import { ThreadListPanel } from './thread-list-panel';
import { MessageList } from './message-list';
import { useQuery } from '@tanstack/react-query';
import { threadsApi, agentsApi, modelsApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Network } from 'lucide-react';
import { OrchestratorGraphModal } from './orchestrator-graph-modal';

export function ChatView({
  threadId,
  initialTitle
}: {
  threadId: string;
  initialTitle?: string;
}) {
  const [graphOpen, setGraphOpen] = useState(false);

  const { data: thread } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => threadsApi.get(threadId)
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list()
  });
  const { data: modelsResp } = useQuery({
    queryKey: ['models'],
    queryFn: () => modelsApi.list()
  });
  const models = modelsResp?.models ?? [];

  const defaultAgent = agents[0];
  const defaultModel = models[0];

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)]">
      <ThreadListPanel />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b bg-background/50 px-4 py-2 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">
              {thread?.title ?? initialTitle ?? threadId.slice(0, 16)}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {defaultAgent?.name ?? 'agent'}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {defaultModel?.model_id ?? '—'}
            </Badge>
            <Badge variant="success" className="text-[10px]">
              single
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => setGraphOpen(true)}>
            <Network className="mr-2 h-4 w-4" />
            编排可视化
          </Button>
        </div>
        <MessageList threadId={threadId} />
      </div>
      <OrchestratorGraphModal open={graphOpen} onOpenChange={setGraphOpen} />
    </div>
  );
}
