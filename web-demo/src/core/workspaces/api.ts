/**
 * /api/workspaces 的薄客户端：统一解析 FastAPI 的
 * ``{detail: {code, message}}``（WorkspaceError 稳定码）与字符串 detail，
 * 归一为带 code 的 WorkspaceApiError。
 */
import { fetch } from "@/core/api/fetcher";

import type {
  WorkspaceTreeResponse,
  WorkspaceView,
} from "./types";

export class WorkspaceApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WorkspaceApiError";
  }
}

async function call<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let code = "unknown";
    let message = res.statusText;
    try {
      const payload = (await res.json()) as { detail?: unknown };
      if (typeof payload.detail === "string") {
        message = payload.detail;
      } else if (payload.detail && typeof payload.detail === "object") {
        const d = payload.detail as { code?: string; message?: string };
        code = d.code ?? code;
        message = d.message ?? message;
      }
    } catch {
      // 响应体非 JSON 时保留 statusText 兜底
    }
    throw new WorkspaceApiError(code, message, res.status);
  }
  return (await res.json()) as T;
}

export function getWorkspaces(): Promise<WorkspaceView[]> {
  return call<WorkspaceView[]>("GET", "/api/workspaces");
}

/** 侧栏一次性投影：持久序工作区（已滤归档/失效）+ Ungrouped + 归档集。 */
export function getWorkspaceTree(): Promise<WorkspaceTreeResponse> {
  return call<WorkspaceTreeResponse>("GET", "/api/workspaces/tree");
}

/** 宿主弹原生目录选择器（DSH host.pickDirectory 对齐）；取消返回 null。 */
export function pickDirectory(): Promise<string | null> {
  return call<{ path: string | null; cancelled?: boolean; error?: string }>(
    "POST",
    "/api/fs/pick-directory",
  ).then((r) => (r.cancelled ? null : r.path));
}

export function createWorkspace(
  path: string,
  title?: string,
): Promise<WorkspaceView> {
  return call<WorkspaceView>("POST", "/api/workspaces", { path, title });
}

export function renameWorkspace(
  workspaceId: string,
  title: string,
): Promise<WorkspaceView> {
  return call<WorkspaceView>("PATCH", `/api/workspaces/${workspaceId}`, { title });
}

/** DOM-insertBefore 语义：beforeId 省略/为 null 移到末尾。 */
export async function reorderWorkspace(
  workspaceId: string,
  beforeId: string | null,
): Promise<void> {
  await call("POST", `/api/workspaces/${workspaceId}/reorder`, {
    before_id: beforeId,
  });
}

/** 仅删注册：目录、文件与线程数据不动，成员随后落入 Ungrouped。 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await call("DELETE", `/api/workspaces/${workspaceId}`);
}

export function listWorkspaceThreads(
  workspaceId: string,
): Promise<{ thread_ids: string[] }> {
  return call<{ thread_ids: string[] }>(
    "GET",
    `/api/workspaces/${workspaceId}/threads`,
  );
}

/** 显式归组既有线程（历史 NULL-cwd 会话的人工 GUI 归组通道）。 */
export async function attachThread(
  workspaceId: string,
  threadId: string,
): Promise<void> {
  await call("POST", `/api/workspaces/${workspaceId}/threads`, {
    thread_id: threadId,
  });
}

/** 幂等 detach；会话数据与不可变 cwd 不动。 */
export async function detachThread(
  workspaceId: string,
  threadId: string,
): Promise<void> {
  await call("DELETE", `/api/workspaces/${workspaceId}/threads/${threadId}`);
}

export async function reorderThread(
  workspaceId: string,
  threadId: string,
  beforeThreadId: string | null,
): Promise<void> {
  await call(
    "POST",
    `/api/workspaces/${workspaceId}/threads/${threadId}/reorder`,
    { before_thread_id: beforeThreadId },
  );
}

export async function archiveThreads(threadIds: string[]): Promise<void> {
  await call("PUT", "/api/workspaces/archive", { thread_ids: threadIds });
}

export async function unarchiveThreads(threadIds: string[]): Promise<void> {
  await call("DELETE", "/api/workspaces/archive", { thread_ids: threadIds });
}
