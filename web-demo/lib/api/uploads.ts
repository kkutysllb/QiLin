import { gatewayFetch } from './client';
import { GATEWAY_BASE_URL } from '@/lib/gateway/config';
import type { Upload, Paginated } from '@/lib/types';

export const uploadsApi = {
  list: (params?: { page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<Upload>>('/api/uploads', { query: params }),
  upload: async (file: File): Promise<Upload> => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`${GATEWAY_BASE_URL}/api/uploads`, {
      method: 'POST',
      body: fd,
      credentials: 'include'
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as Upload;
  },
  delete: (id: string) =>
    gatewayFetch<void>(`/api/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' })
};
