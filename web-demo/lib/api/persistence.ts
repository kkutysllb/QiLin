import { gatewayFetch } from './client';
import type { PersistenceStatus, PersistenceUsage } from '@/lib/types/persistence';

/**
 * Persistence API — 数据库/持久层状态
 *
 * 关键端点:
 * - GET /api/persistence/status  后端 + 迁移状态 + checkpoint 统计
 * - GET /api/persistence/usage   数据规模统计
 */
export const persistenceApi = {
  status: () => gatewayFetch<PersistenceStatus>('/api/persistence/status'),
  usage: () => gatewayFetch<PersistenceUsage>('/api/persistence/usage')
};
