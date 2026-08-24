'use client';
import { useState } from 'react';
import { SkillCard } from './skill-card';
import { SkillDetailDrawer } from './skill-detail-drawer';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { EmptyState } from '@/components/shared/empty-state';
import { Sparkles } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { skillsApi } from '@/lib/api';
import { toast } from 'sonner';
import type { Skill } from '@/lib/types';

export function SkillGrid({ initial }: { initial: Skill[] }) {
  const [filter, setFilter] = useState('');
  const [source, setSource] = useState<string>('all');
  const [selected, setSelected] = useState<Skill | null>(null);

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      skillsApi.setEnabled(name, enabled),
    onSuccess: () => toast.success('技能状态已更新'),
    onError: (e) => toast.error(`更新失败: ${(e as Error).message}`)
  });

  const filtered = initial.filter((s) => {
    if (filter && !s.name.includes(filter) && !s.description.includes(filter)) return false;
    if (source !== 'all' && s.source !== source) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="搜索技能名称或描述…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="来源" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            <SelectItem value="builtin">builtin</SelectItem>
            <SelectItem value="marketplace">marketplace</SelectItem>
            <SelectItem value="user">user</SelectItem>
            <SelectItem value="community">community</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={initial.length === 0 ? '技能市场为空' : '没有匹配的技能'}
          description={
            initial.length === 0 ? '运行 gateway 并加载技能后可在此查看' : '调整搜索条件或来源过滤'
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <SkillCard
              key={s.name}
              skill={s}
              onSelect={setSelected}
              onToggle={(skill, enabled) => toggleMutation.mutate({ name: skill.name, enabled })}
            />
          ))}
        </div>
      )}

      <SkillDetailDrawer skill={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
