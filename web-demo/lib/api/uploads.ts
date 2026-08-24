import { gatewayFetch } from './client';
import { GATEWAY_BASE_URL } from '@/lib/gateway/config';

export interface Upload {
  filename: string;
  virtual_path: string;
  size: number;
  mime_type: string;
  uploaded_at: string;
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
 * - /api/threads/{thread_id}/uploads/list         (GET 列表)
 * - /api/threads/{thread_id}/uploads/{filename}   (DELETE 单个)
 * - /api/threads/{thread_id}/uploads/limits       (GET 限制)
 */

export const uploadsApi = {
  /** 获取某个线程的上传限制 */
  limits: (thread_id: string) =>
    gatewayFetch<UploadLimits>(
      `/api/threads/${encodeURIComponent(thread_id)}/uploads/limits`
    ),
  /** 列出某个线程的所有上传 */
  list: (thread_id: string) =>
    gatewayFetch<Upload[]>(`/api/threads/${encodeURIComponent(thread_id)}/uploads/list`),
  /** 上传文件到某个线程 */
  upload: async (thread_id: string, file: File): Promise<Upload> => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(
      `${GATEWAY_BASE_URL}/api/threads/${encodeURIComponent(thread_id)}/uploads`,
      {
        method: 'POST',
        body: fd,
        credentials: 'include'
      }
    );
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
