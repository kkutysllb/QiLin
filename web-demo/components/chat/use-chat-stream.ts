'use client';
import { useCallback, useRef, useState } from 'react';
import { useEventSource } from '@/lib/sse/use-event-source';
import { runsApi } from '@/lib/api';
import { GATEWAY_BASE_URL } from '@/lib/gateway/config';
import type { DisplayMessage } from './message-item';
import type { DisplayToolCall } from './tool-call-card';
import type { DisplaySubagent } from './subagent-card';

interface StreamState {
  messages: DisplayMessage[];
  tokenUsage: { input_tokens: number; output_tokens: number; total_tokens: number };
  isStreaming: boolean;
  currentRunId: string | null;
  send: (text: string) => Promise<void>;
}

export function useChatStream(threadId: string): StreamState {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [tokenUsage, setTokenUsage] = useState({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const bufferRef = useRef('');

  useEventSource({
    url: currentRunId ? `${GATEWAY_BASE_URL}/api/runs/${currentRunId}/stream` : null,
    onEvent: (event) => {
      switch (event.type) {
        case 'message.chunk': {
          bufferRef.current += event.delta;
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant' && last.id === '__streaming__') {
              next[next.length - 1] = { ...last, content: bufferRef.current };
            } else {
              next.push({
                id: '__streaming__',
                role: 'assistant',
                content: bufferRef.current,
                created_at: new Date().toISOString()
              });
            }
            return next;
          });
          break;
        }
        case 'message.complete':
          bufferRef.current = '';
          setIsStreaming(false);
          break;
        case 'tool.call': {
          const tc: DisplayToolCall = {
            id: event.tool_call.id,
            name: event.tool_call.name,
            args: event.tool_call.args,
            status: 'running'
          };
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                tool_calls_display: [...(last.tool_calls_display ?? []), tc]
              };
            } else {
              next.push({
                id: '__tool_stream__',
                role: 'assistant',
                content: '',
                created_at: new Date().toISOString(),
                tool_calls_display: [tc]
              });
            }
            return next;
          });
          break;
        }
        case 'tool.result': {
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              const m = next[i];
              if (m.tool_calls_display) {
                const has = m.tool_calls_display.some((t) => t.id === event.tool_call_id);
                if (has) {
                  m.tool_calls_display = m.tool_calls_display.map((t) =>
                    t.id === event.tool_call_id
                      ? {
                          ...t,
                          result: event.result,
                          duration_ms: event.duration_ms,
                          status: 'completed'
                        }
                      : t
                  );
                  break;
                }
              }
            }
            return next;
          });
          break;
        }
        case 'subagent.start': {
          const sa: DisplaySubagent = {
            id: event.subagent_id,
            name: event.subagent_name,
            status: 'running'
          };
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                subagents: [...(last.subagents ?? []), sa]
              };
            } else {
              next.push({
                id: '__sa_stream__',
                role: 'assistant',
                content: '',
                created_at: new Date().toISOString(),
                subagents: [sa]
              });
            }
            return next;
          });
          break;
        }
        case 'subagent.complete': {
          setMessages((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              const m = next[i];
              if (m.subagents) {
                const has = m.subagents.some((s) => s.id === event.subagent_id);
                if (has) {
                  m.subagents = m.subagents.map((s) =>
                    s.id === event.subagent_id
                      ? {
                          ...s,
                          status: event.success ? 'completed' : 'failed',
                          result: event.result,
                          error: event.error
                        }
                      : s
                  );
                  break;
                }
              }
            }
            return next;
          });
          break;
        }
        case 'token.usage':
          setTokenUsage({
            input_tokens: event.input_tokens,
            output_tokens: event.output_tokens,
            total_tokens: event.total_tokens
          });
          break;
        case 'error':
          setIsStreaming(false);
          console.error('Stream error:', event.message);
          break;
        case 'done':
          setIsStreaming(false);
          setCurrentRunId(null);
          break;
      }
    }
  });

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;
      bufferRef.current = '';
      setMessages((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          role: 'user',
          content: text,
          created_at: new Date().toISOString()
        }
      ]);
      setIsStreaming(true);
      try {
        const run = await runsApi.create({ thread_id: threadId, input: text });
        setCurrentRunId(run.run_id);
      } catch (e) {
        setIsStreaming(false);
        console.error('Failed to create run:', e);
      }
    },
    [threadId, isStreaming]
  );

  return { messages, tokenUsage, isStreaming, currentRunId, send };
}
