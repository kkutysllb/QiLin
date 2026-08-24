import { skillsApi } from '@/lib/api';
import { SkillGrid } from '@/components/skills/skill-grid';

export const dynamic = 'force-dynamic';

export default async function SkillsPage() {
  const result = await skillsApi.list().catch(() => ({ skills: [] }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">技能市场</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          浏览、启用与扫描 QiLin 技能({result.skills.length} 个)
        </p>
      </div>
      <SkillGrid initial={result.skills} />
    </div>
  );
}
