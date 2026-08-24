import { gatewayFetch } from './client';
import type {
  ModelConfig,
  ModelCreateInput,
  ModelUpdateInput,
  ModelsListResponse
} from '@/lib/types/model';

/**
 * Models API — LLM provider 模型配置
 *
 * 关键端点:
 * - GET    /api/models                  列出所有模型({ models: [], token_usage: { enabled } })
 * - POST   /api/models                  新增模型
 * - GET    /api/models/{model_name}     模型详情
 * - PUT    /api/models/{model_name}     更新模型
 * - DELETE /api/models/{model_name}     删除模型
 */
export const modelsApi = {
  /** 列出所有模型(响应: { models: ModelConfig[], token_usage?: { enabled } }) */
  list: () => gatewayFetch<ModelsListResponse>('/api/models'),
  /** 模型详情 */
  get: (name: string) =>
    gatewayFetch<ModelConfig>(`/api/models/${encodeURIComponent(name)}`),
  /** 新增模型 */
  create: (input: ModelCreateInput) =>
    gatewayFetch<ModelConfig>('/api/models', { method: 'POST', body: input }),
  /** 更新模型 */
  update: (name: string, input: ModelUpdateInput) =>
    gatewayFetch<ModelConfig>(`/api/models/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: input
    }),
  /** 删除模型 */
  delete: (name: string) =>
    gatewayFetch<void>(`/api/models/${encodeURIComponent(name)}`, { method: 'DELETE' })
};
