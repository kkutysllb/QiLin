import type { ID, ISODateString } from './common';

export interface Thread {
  thread_id: ID;
  title?: string;
  created_at: ISODateString;
  updated_at: ISODateString;
  metadata?: Record<string, unknown>;
}

export interface ThreadMessage {
  id: ID;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  created_at: ISODateString;
}

export interface ToolCall {
  id: ID;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  duration_ms?: number;
}
