/** Console/Tracing types — 对应 /api/console/* 端点 */
import type { ID, ISODateString } from './common';

export interface ConsoleStats {
  total_runs: number;
  active_runs: number;
  failed_runs: number;
  total_threads: number;
  total_agents: number;
  total_tokens: number;
  total_cost: number | null;
  currency: string | null;
}

export interface ConsoleRunsResponse {
  runs: ConsoleRunEntry[];
  has_more: boolean;
}

export interface ConsoleRunEntry {
  run_id: ID;
  thread_id: ID;
  status: string;
  started_at?: ISODateString;
  completed_at?: ISODateString;
  duration_ms?: number;
  model?: string;
  agent_name?: string;
  error?: string;
}

export interface ConsoleUsageDay {
  date: ISODateString;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  runs: number;
  cost: number;
}

export interface ConsoleUsage {
  days: ConsoleUsageDay[];
  [k: string]: unknown;
}

export interface WorkspaceChange {
  path: string;
  kind: 'added' | 'modified' | 'deleted' | 'renamed';
  old_path?: string;
  size_bytes?: number;
  timestamp?: ISODateString;
  diff?: string;
}
