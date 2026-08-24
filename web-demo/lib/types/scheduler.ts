/** Scheduler subsystem types — 对应 /api/scheduled-tasks/* 端点 */
import type { ID, ISODateString } from './common';

export type ScheduledTaskStatus = 'active' | 'paused' | 'running' | 'completed' | 'failed';

export interface ScheduledTask {
  id: ID;
  name: string;
  description?: string;
  cron: string;
  timezone?: string;
  agent_name?: string;
  thread_id?: ID;
  input?: Record<string, unknown>;
  enabled?: boolean;
  status?: ScheduledTaskStatus;
  last_run_at?: ISODateString | null;
  next_run_at?: ISODateString | null;
  created_at: ISODateString;
  updated_at?: ISODateString;
}

export interface ScheduledTaskCreateInput {
  name: string;
  cron: string;
  description?: string;
  timezone?: string;
  agent_name?: string;
  thread_id?: ID;
  input?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ScheduledTaskUpdateInput {
  name?: string;
  cron?: string;
  description?: string;
  timezone?: string;
  agent_name?: string;
  thread_id?: ID;
  input?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ScheduledTaskRun {
  task_id: ID;
  run_id: ID;
  started_at: ISODateString;
  completed_at?: ISODateString | null;
  status: ScheduledTaskStatus;
  error?: string;
}
