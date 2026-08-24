import { gatewayFetch } from './client';
import { GATEWAY_BASE_URL } from '@/lib/gateway/config';
import type { Skill } from '@/lib/types';

export const skillsApi = {
  /** 列出所有技能(扁平结构,非分页) */
  list: () => gatewayFetch<{ skills: Skill[] }>('/api/skills'),
  /** 获取单个技能详情 */
  get: (name: string) =>
    gatewayFetch<Skill>(`/api/skills/${encodeURIComponent(name)}`),
  /** 启用/禁用技能(更新技能配置) */
  setEnabled: (name: string, enabled: boolean) =>
    gatewayFetch<Skill>(`/api/skills/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: { enabled }
    }),
  /** 删除技能(custom 路径) */
  delete: (name: string) =>
    gatewayFetch<void>(`/api/skills/custom/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    }),
  /** 通过 multipart 上传技能包 */
  install: async (formData: FormData): Promise<Skill> => {
    const r = await fetch(`${GATEWAY_BASE_URL}/api/skills/install`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as Skill;
  },
  /** 通过 multipart 上传技能包(带上传元数据) */
  installUpload: async (formData: FormData): Promise<Skill> => {
    const r = await fetch(`${GATEWAY_BASE_URL}/api/skills/install-upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as Skill;
  },
  /** 重新加载技能清单 */
  reload: () => gatewayFetch<{ reloaded: number }>('/api/skills/reload', { method: 'POST' })
};
