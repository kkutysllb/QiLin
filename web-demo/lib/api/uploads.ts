import { gatewayFetch } from './client';
import { buildUrl, needsCsrf } from './client';

// Note: raw fetch (for multipart) uses buildUrl() + needsCsrf() so it routes
// through /api/proxy (browser) or direct (SSR) just like gatewayFetch.

export interface Upload {
  filename: string;
  virtual_path: string;
  size: number;
  mime_type: string;
  uploaded_at: string;
}

export interface UploadsListResponse {
  files: Upload[];
  count: number;
}

export interface UploadLimits {
  max_file_size: number;
  allowed_extensions: string[];
  max_files_per_thread: number;
}

/**
 * Uploads 真实接口:
 * - 顶层没有 /api/uploads;所有 uploads 都绑定到某个 thread
 * - /api/threads/{thread_id}/uploads              (POST 上传)
 * - /api/threads/{thread_id}/uploads/list         (GET 列表 — 返回 { files, count })
 * - /api/threads/{thread_id}/uploads/{filename}   (DELETE 单个)
 * - /api/threads/{thread_id}/uploads/limits       (GET 限制)
 */

export const uploadsApi = {
  /** 获取某个线程的上传限制 */
  limits: (thread_id: string) =>
    gatewayFetch<UploadLimits>(
      `/api/threads/${encodeURIComponent(thread_id)}/uploads/limits`
    ),
  /** 列出某个线程的所有上传 — 返回 { files: Upload[], count: number } */
  list: (thread_id: string) =>
    gatewayFetch<UploadsListResponse>(
      `/api/threads/${encodeURIComponent(thread_id)}/uploads/list`
    ),
  /** 上传文件到某个线程(走 multipart,不走 client.ts 以保留 FormData) */
  upload: async (thread_id: string, file: File): Promise<Upload> => {
    const fd = new FormData();
    fd.append('file', file);
    const isBrowser = typeof window !== 'undefined';
    const url = buildUrl(
      `/api/threads/${encodeURIComponent(thread_id)}/uploads`
    );
    const r = await fetch(url, {
      method: 'POST',
      body: fd,
      credentials: isBrowser ? 'include' : 'omit'
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as Upload;
  },
  /** 删除某个线程的某个文件 */
  delete: (thread_id: string, filename: string) =>
    gatewayFetch<void>(
      `/api/threads/${encodeURIComponent(thread_id)}/uploads/${encodeURIComponent(filename)}`,
      { method: 'DELETE' }
    )
};
