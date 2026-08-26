/** Scheduled task status returned by the API. */
export type ScheduledTaskStatus =
  | "enabled"
  | "paused"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** Schedule type for the task. */
export type ScheduleType = "once" | "cron";

/** Context mode determines how threads are created per run. */
export type ContextMode = "fresh_thread_per_run" | "reuse_thread";

/** Scheduled task returned by GET /api/scheduled-tasks. */
export interface ScheduledTask {
  task_id: string;
  user_id: string;
  thread_id: string | null;
  context_mode: ContextMode;
  assistant_id: string;
  title: string;
  prompt: string;
  schedule_type: ScheduleType;
  schedule_spec: Record<string, unknown>;
  timezone: string;
  status: ScheduledTaskStatus;
  next_run_at: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Request body for POST /api/scheduled-tasks. */
export interface CreateScheduledTaskRequest {
  thread_id?: string | null;
  context_mode?: ContextMode;
  title: string;
  prompt: string;
  schedule_type: ScheduleType;
  schedule_spec: Record<string, unknown>;
  timezone: string;
}

/** Request body for PATCH /api/scheduled-tasks/{task_id}. */
export interface UpdateScheduledTaskRequest {
  context_mode?: ContextMode;
  thread_id?: string | null;
  title?: string;
  prompt?: string;
  schedule_spec?: Record<string, unknown>;
  timezone?: string;
}
