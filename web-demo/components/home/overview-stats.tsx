import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Activity, Sparkles, Layers } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

export interface Stat {
  label: string;
  value: number | string;
  icon: typeof MessageSquare;
  trend?: string;
}

interface OverviewStatsProps {
  stats: Stat[];
}

export function OverviewStats({ stats }: OverviewStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {typeof s.value === 'number' ? formatNumber(s.value) : s.value}
              </div>
              {s.trend && <p className="mt-1 text-xs text-muted-foreground">{s.trend}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export const DEFAULT_STATS: Stat[] = [
  { label: '线程总数', value: 0, icon: MessageSquare, trend: '—' },
  { label: '今日运行', value: 0, icon: Activity, trend: '—' },
  { label: '已启用技能', value: 0, icon: Sparkles, trend: '—' },
  { label: '可用模型', value: 0, icon: Layers, trend: '—' }
];
