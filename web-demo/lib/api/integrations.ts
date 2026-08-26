import { gatewayFetch } from './client';
import type {
  LarkAuthCompleteRequest,
  LarkAuthCompleteResponse,
  LarkAuthStartRequest,
  LarkAuthStartResponse,
  LarkConfigCompleteRequest,
  LarkConfigCompleteResponse,
  LarkConfigStartRequest,
  LarkConfigStartResponse,
  LarkInstallResponse,
  LarkIntegrationStatus
} from '@/lib/types/integration';

/**
 * Integrations API — 第三方集成(Lark/飞书)
 *
 * 关键端点:
 * - GET  /api/integrations/lark/status            集成状态
 * - POST /api/integrations/lark/install           安装 Lark 应用
 * - POST /api/integrations/lark/auth/start        开始 OAuth(Device Code)
 * - POST /api/integrations/lark/auth/complete     完成 OAuth(poll device_code)
 * - POST /api/integrations/lark/config/start      开始配置(品牌等)
 * - POST /api/integrations/lark/config/complete   完成配置
 */
export const integrationsApi = {
  /** Lark 集成状态 */
  status: () => gatewayFetch<LarkIntegrationStatus>('/api/integrations/lark/status'),
  /** 安装 Lark 应用 */
  install: () => gatewayFetch<LarkInstallResponse>('/api/integrations/lark/install', {
    method: 'POST'
  }),
  /** 开始 OAuth 授权(返回 verification_url + device_code) */
  authStart: (input?: LarkAuthStartRequest) =>
    gatewayFetch<LarkAuthStartResponse>('/api/integrations/lark/auth/start', {
      method: 'POST',
      body: input ?? {}
    }),
  /** 完成 OAuth 授权(poll device_code) */
  authComplete: (input: LarkAuthCompleteRequest) =>
    gatewayFetch<LarkAuthCompleteResponse>('/api/integrations/lark/auth/complete', {
      method: 'POST',
      body: input
    }),
  /** 开始配置流程 */
  configStart: (input: LarkConfigStartRequest) =>
    gatewayFetch<LarkConfigStartResponse>('/api/integrations/lark/config/start', {
      method: 'POST',
      body: input
    }),
  /** 完成配置流程 */
  configComplete: (input: LarkConfigCompleteRequest) =>
    gatewayFetch<LarkConfigCompleteResponse>('/api/integrations/lark/config/complete', {
      method: 'POST',
      body: input
    })
};
