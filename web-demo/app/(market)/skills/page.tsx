import { skillsApi } from '@/lib/api';
import { SkillGrid } from '@/components/skills/skill-grid';
import type { Skill } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SkillsPage() {
  const result = await skillsApi
    .list({ page: 1, page_size: 100 })
    .catch(() => ({ items: [] as Skill[], total: 0, page: 1, page_size: 100 }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">技能市场</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          浏览、启用与扫描 QiLin 技能({result.items.length} 个)
        </p>
      </div>
      <SkillGrid initial={result.items} />
    </div>
  );
}
