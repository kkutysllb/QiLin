import { gatewayFetch } from './client';

export interface MemoryFact {
  id: string;
  content: string;
  category: string;
  confidence: number;
  created_at: string;
}

export interface MemoryStatus {
  backend: string;
  facts_count: number;
  healthy: boolean;
}

export const memoryApi = {
  /** 列出所有记忆事实(简单数组,非分页) */
  list: () => gatewayFetch<MemoryFact[]>('/api/memory/facts'),
  /** 检索记忆事实(查询参数 q) */
  search: (q: string) =>
    gatewayFetch<MemoryFact[]>(`/api/memory/facts?q=${encodeURIComponent(q)}`),
  /** 创建记忆事实 */
  create: (input: { content: string; category?: string; confidence?: number }) =>
    gatewayFetch<MemoryFact>('/api/memory/facts', { method: 'POST', body: input }),
  /** 更新记忆事实 */
  update: (
    id: string,
    input: Partial<{ content: string; category: string; confidence: number }>
  ) =>
    gatewayFetch<MemoryFact>(`/api/memory/facts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input
    }),
  /** 删除记忆事实 */
  delete: (id: string) =>
    gatewayFetch<void>(`/api/memory/facts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** 重新加载记忆 */
  reload: () => gatewayFetch<{ reloaded: number }>('/api/memory/reload', { method: 'POST' }),
  /** 清空所有记忆 */
  clear: () => gatewayFetch<void>('/api/memory', { method: 'DELETE' }),
  /** 记忆系统状态 */
  status: () => gatewayFetch<MemoryStatus>('/api/memory/status'),
  /** 导出全部记忆 */
  export: () => gatewayFetch<{ facts: MemoryFact[] }>('/api/memory/export'),
  /** 导入记忆 */
  import: (facts: MemoryFact[]) =>
    gatewayFetch<{ imported: number }>('/api/memory/import', {
      method: 'POST',
      body: { facts }
    })
};
