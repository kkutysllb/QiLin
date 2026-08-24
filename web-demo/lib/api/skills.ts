import { gatewayFetch } from './client';
import { GATEWAY_BASE_URL } from '@/lib/gateway/config';
import type { Skill, SkillScanResult, Paginated } from '@/lib/types';

export const skillsApi = {
  list: (params?: { source?: string; enabled?: boolean; page?: number; page_size?: number }) =>
    gatewayFetch<Paginated<Skill>>('/api/skills', { query: params }),
  get: (name: string) => gatewayFetch<Skill>(`/api/skills/${encodeURIComponent(name)}`),
  install: async (formData: FormData): Promise<Skill> => {
    const r = await fetch(`${GATEWAY_BASE_URL}/api/skills/install`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as Skill;
  },
  setEnabled: (name: string, enabled: boolean) =>
    gatewayFetch<Skill>(`/api/skills/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: { enabled }
    }),
  delete: (name: string) =>
    gatewayFetch<void>(`/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  rescan: (name: string) =>
    gatewayFetch<SkillScanResult>(`/api/skills/${encodeURIComponent(name)}/rescan`, {
      method: 'POST'
    })
};
