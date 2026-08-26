import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

import type {
  CreateScheduledTaskRequest,
  ScheduledTask,
  UpdateScheduledTaskRequest,
} from "./types";

const BASE = `${getBackendBaseURL()}/api/scheduled-tasks`;

async function handleResponse(response: Response): Promise<void> {
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(
      (detail as { detail?: string }).detail ??
        `Request failed (${response.status})`,
    );
  }
}

/** List all scheduled tasks for the current user. */
export async function fetchScheduledTasks(): Promise<ScheduledTask[]> {
  const response = await fetch(BASE);
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(
      (detail as { detail?: string }).detail ??
        `Failed to fetch tasks (${response.status})`,
    );
  }
  return response.json() as Promise<ScheduledTask[]>;
}

/** Create a new scheduled task. */
export async function createScheduledTask(
  body: CreateScheduledTaskRequest,
): Promise<ScheduledTask> {
  const response = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(
      (detail as { detail?: string }).detail ??
        `Failed to create task (${response.status})`,
    );
  }
  return response.json() as Promise<ScheduledTask>;
}

/** Update an existing scheduled task. */
export async function updateScheduledTask(
  taskId: string,
  body: UpdateScheduledTaskRequest,
): Promise<ScheduledTask> {
  const response = await fetch(`${BASE}/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(
      (detail as { detail?: string }).detail ??
        `Failed to update task (${response.status})`,
    );
  }
  return response.json() as Promise<ScheduledTask>;
}

/** Pause a scheduled task. */
export async function pauseScheduledTask(taskId: string): Promise<ScheduledTask> {
  const response = await fetch(
    `${BASE}/${encodeURIComponent(taskId)}/pause`,
    { method: "POST" },
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(
      (detail as { detail?: string }).detail ??
        `Failed to pause task (${response.status})`,
    );
  }
  return response.json() as Promise<ScheduledTask>;
}

/** Resume a paused scheduled task. */
export async function resumeScheduledTask(taskId: string): Promise<ScheduledTask> {
  const response = await fetch(
    `${BASE}/${encodeURIComponent(taskId)}/resume`,
    { method: "POST" },
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(
      (detail as { detail?: string }).detail ??
        `Failed to resume task (${response.status})`,
    );
  }
  return response.json() as Promise<ScheduledTask>;
}

/** Manually trigger a scheduled task immediately. */
export async function triggerScheduledTask(taskId: string): Promise<void> {
  const response = await fetch(
    `${BASE}/${encodeURIComponent(taskId)}/trigger`,
    { method: "POST" },
  );
  await handleResponse(response);
}

/** Delete a scheduled task. */
export async function deleteScheduledTask(taskId: string): Promise<void> {
  const response = await fetch(
    `${BASE}/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );
  await handleResponse(response);
}
