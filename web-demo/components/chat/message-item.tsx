'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { ToolCallCard, type DisplayToolCall } from './tool-call-card';
import { SubagentCard, type DisplaySubagent } from './subagent-card';
import { cn } from '@/lib/utils';
import type { ThreadMessage } from '@/lib/types';

export interface DisplayMessage extends ThreadMessage {
  tool_calls_display?: DisplayToolCall[];
  subagents?: DisplaySubagent[];
}

export function MessageItem({
  message,
  isStreaming
}: {
  message: DisplayMessage;
  isStreaming?: boolean;
}) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex max-w-[85%] flex-col gap-2', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm',
            isUser ? 'bg-primary text-primary-foreground' : 'border bg-muted/50',
            isStreaming && 'animate-pulse'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {message.content || (isStreaming ? '● 思考中…' : '')}
              </ReactMarkdown>
            </div>
          )}
        </div>
        {message.tool_calls_display && message.tool_calls_display.length > 0 && (
          <div className="w-full space-y-2">
            {message.tool_calls_display.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
        {message.subagents && message.subagents.length > 0 && (
          <div className="w-full space-y-2">
            {message.subagents.map((sa) => (
              <SubagentCard key={sa.id} subagent={sa} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
