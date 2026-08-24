import { gatewayFetch } from './client';
import type { ModelInfo } from '@/lib/types';

export const modelsApi = {
  list: () => gatewayFetch<ModelInfo[]>('/api/models'),
  get: (name: string) => gatewayFetch<ModelInfo>(`/api/models/${encodeURIComponent(name)}`)
};
