export interface FileEntry {
  name: string;
  type: "file" | "dir" | "symlink" | "broken";
  size: number;
  mtime: number;
  mime: string | null;
}
export interface FileListResponse {
  entries: FileEntry[];
  parent: string | null;
}

export class FileApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  // Auth + CSRF are handled by the same-origin session cookie; routes live under
  // the proxied /api path so no per-route client method is needed.
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let code = "unknown";
    let message = res.statusText;
    try { const j = await res.json(); code = j?.error?.code ?? code; message = j?.error?.message ?? message; } catch {}
    throw new FileApiError(code, message, res.status);
  }
  return (await res.json()) as T;
}

export async function listDir(threadId: string, path: string): Promise<FileListResponse> {
  const qs = new URLSearchParams({ thread_id: threadId, path });
  return call("GET", `/api/files/list?${qs.toString()}`);
}

export async function readFile(threadId: string, path: string): Promise<string> {
  const qs = new URLSearchParams({ thread_id: threadId, path });
  const j = await call<{ content: string; mime: string | null }>("GET", `/api/files/read?${qs.toString()}`);
  return j.content;
}

export async function writeFile(threadId: string, path: string, content: string): Promise<void> {
  await call("POST", "/api/files/write", { thread_id: threadId, path, content });
}

export async function readRaw(threadId: string, path: string): Promise<Blob> {
  const qs = new URLSearchParams({ thread_id: threadId, path });
  const res = await fetch(`/api/files/raw?${qs.toString()}`, { credentials: "include" });
  if (!res.ok) throw new FileApiError("file_read_failed", res.statusText, res.status);
  return res.blob();
}
