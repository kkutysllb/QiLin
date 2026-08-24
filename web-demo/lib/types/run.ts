import type { ID, ISODateString } from './common';

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Run {
  run_id: ID;
  thread_id: ID;
  agent_name: string;
  status: RunStatus;
  created_at: ISODateString;
  updated_at: ISODateString;
  started_at?: ISODateString;
  completed_at?: ISODateString;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

// SSE 流式事件类型
export type StreamEvent =
  | { type: 'message.start'; run_id: string; thread_id: string }
  | { type: 'message.chunk'; run_id: string; delta: string }
  | { type: 'message.complete'; run_id: string; content: string }
  | { type: 'tool.call'; run_id: string; tool_call: ToolCallInfo }
  | { type: 'tool.result'; run_id: string; tool_call_id: string; result: string; duration_ms: number }
  | { type: 'subagent.start'; run_id: string; subagent_id: string; subagent_name: string }
  | { type: 'subagent.event'; run_id: string; subagent_id: string; event: string }
  | {
      type: 'subagent.complete';
      run_id: string;
      subagent_id: string;
      success: boolean;
      result?: string;
      error?: string;
    }
  | {
      type: 'token.usage';
      run_id: string;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    }
  | { type: 'error'; run_id: string; message: string }
  | { type: 'done'; run_id: string };
