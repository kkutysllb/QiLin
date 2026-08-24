import type { Skill } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { Sparkles, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

const SCAN_ICON = {
  passed: <ShieldCheck className="h-3.5 w-3.5 text-qilin-400" />,
  warning: <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />,
  rejected: <Shield className="h-3.5 w-3.5 text-destructive" />,
  scanning: <Shield className="h-3.5 w-3.5 animate-pulse text-muted-foreground" />,
  pending: <Shield className="h-3.5 w-3.5 text-muted-foreground" />
};

const SOURCE_VARIANT: Record<Skill['source'], 'default' | 'secondary' | 'outline' | 'success'> = {
  builtin: 'default',
  marketplace: 'secondary',
  user: 'outline',
  community: 'success'
};

interface SkillCardProps {
  skill: Skill;
  onSelect?: (s: Skill) => void;
  onToggle?: (s: Skill, enabled: boolean) => void;
}

export function SkillCard({ skill, onSelect, onToggle }: SkillCardProps) {
  return (
    <Card className="flex h-full flex-col transition-colors hover:border-primary/40">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-qilin-400" />
            {skill.name}
          </CardTitle>
          <Switch
            checked={skill.enabled}
            onCheckedChange={(c) => onToggle?.(skill, c)}
            aria-label="启用"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={SOURCE_VARIANT[skill.source]}>{skill.source}</Badge>
          {skill.scan_status && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {SCAN_ICON[skill.scan_status]}
              {skill.scan_status}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {truncate(skill.description, 120)}
        </p>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{skill.installed_at ? formatRelativeTime(skill.installed_at) : '未安装'}</span>
          <Button variant="ghost" size="sm" onClick={() => onSelect?.(skill)}>
            详情
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
