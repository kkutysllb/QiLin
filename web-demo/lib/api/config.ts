import { gatewayFetch } from './client';
import type {
  ConfigFullResponse,
  ConfigRestartResponse,
  ConfigSectionResponse,
  ConfigSectionUpdateInput
} from '@/lib/types/config';

/**
 * Config API — Gateway 全局配置 + 热重载
 *
 * 关键端点:
 * - GET  /api/config              完整配置
 * - POST /api/config/restart      重启 gateway(热重载配置)
 * - GET  /api/config/{section}    单 section
 * - PUT  /api/config/{section}    更新单 section
 *
 * Section 列表(典型):
 *   - config_version (int)
 *   - log_level (str)
 *   - sandbox (dict)
 *   - database (dict)
 *   - checkpointer (dict)
 *   - memory (dict)
 *   - models (dict)
 *   - channels (dict)
 *   - mcp (dict)
 *   - skills (dict)
 *   - guardrails (dict)
 *   - ... (取决于 gateway 版本)
 */
export const configApi = {
  /** 获取完整配置 */
  full: () => gatewayFetch<ConfigFullResponse>('/api/config'),
  /** 重启 gateway(热重载) */
  restart: () => gatewayFetch<ConfigRestartResponse>('/api/config/restart', { method: 'POST' }),
  /** 单 section 详情 */
  getSection: (section: string) =>
    gatewayFetch<ConfigSectionResponse>(`/api/config/${encodeURIComponent(section)}`),
  /** 更新单 section(写入后通常需要 restart 才生效) */
  updateSection: (section: string, input: ConfigSectionUpdateInput) =>
    gatewayFetch<ConfigSectionResponse>(`/api/config/${encodeURIComponent(section)}`, {
      method: 'PUT',
      body: input
    })
};
