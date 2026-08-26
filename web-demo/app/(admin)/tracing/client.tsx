'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Activity as ActivityIcon,
  Hash,
  Clock,
  DollarSign,
  Cpu,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type {
  ConsoleStats,
  ConsoleRunsResponse,
  ConsoleUsage,
  ConsoleUsageDay
} from '@/lib/types/console';

interface Props {
  initialStats: ConsoleStats | null;
  initialRuns: ConsoleRunsResponse | null;
  initialUsage: ConsoleUsage | null;
}

export function TracingClient({ initialStats, initialRuns, initialUsage }: Props) {
  const router = useRouter();

  if (!initialStats) {
    return (
      <Alert variant="destructive">
        <AlertTitle>无法加载追踪数据</AlertTitle>
        <AlertDescription>请检查 gateway 连接</AlertDescription>
      </Alert>
    );
  }

  const s = initialStats;
  const days = initialUsage?.days ?? [];
  const totalTokens = days.reduce((sum, d) => sum + d.total_tokens, 0);
  const maxDayTokens = Math.max(...days.map((d) => d.total_tokens), 1);

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => router.refresh()}>
          <RefreshCw className="mr-2 h-3 w-3" />
          刷新
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Hash} label="Total Threads" value={s.total_threads} />
        <Kpi icon={ActivityIcon} label="Total Runs" value={s.total_runs} accent />
        <Kpi icon={Clock} label="Active Runs" value={s.active_runs} />
        <Kpi icon={TrendingUp} label="Failed Runs" value={s.failed_runs} destructive={s.failed_runs > 0} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi icon={Cpu} label="Total Tokens" value={s.total_tokens} accent />
        <Kpi icon={DollarSign} label="Total Cost" value={s.total_cost == null ? '—' : `$${s.total_cost.toFixed(4)}`} />
        <Kpi icon={Hash} label="Total Agents" value={s.total_agents} />
      </div>

      {/* Usage Time Series */}
      {days.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Token 用量时间序列</CardTitle>
            <CardDescription className="text-xs">
              最近 {days.length} 天 · 合计 {formatNumber(totalTokens)} tokens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {days.slice(-14).map((d) => (
              <DayRow key={d.date} day={d} maxTokens={maxDayTokens} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">最近运行</CardTitle>
          <CardDescription className="text-xs">
            Console 聚合视图 · 共 {initialRuns?.runs.length ?? 0} 条
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!initialRuns || initialRuns.runs.length === 0 ? (
            <EmptyState
              icon={ActivityIcon}
              title="暂无运行"
              description="触发一次对话或 cron 任务后会显示在这里"
            />
          ) : (
            <div className="space-y-1.5">
              {initialRuns.runs.map((r) => (
                <div
                  key={r.run_id}
                  className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        r.status === 'completed'
                          ? 'success'
                          : r.status === 'failed'
                          ? 'destructive'
                          : 'outline'
                      }
                    >
                      {r.status}
                    </Badge>
                    <code className="font-mono text-xs">{r.run_id.slice(0, 16)}</code>
                    {r.agent_name && (
                      <span className="text-xs text-muted-foreground">{r.agent_name}</span>
                    )}
                  </div>
                  {r.started_at && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.started_at).toLocaleString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent,
  destructive
}: {
  icon: typeof ActivityIcon;
  label: string;
  value: number | string;
  accent?: boolean;
  destructive?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p
            className={`mt-1 font-mono text-2xl font-semibold ${
              destructive ? 'text-destructive' : accent ? 'text-qilin-400' : ''
            }`}
          >
            {typeof value === 'number' ? formatNumber(value) : value}
          </p>
        </div>
        <Icon className={`h-5 w-5 ${destructive ? 'text-destructive' : 'text-muted-foreground'}`} />
      </CardContent>
    </Card>
  );
}

function DayRow({ day, maxTokens }: { day: ConsoleUsageDay; maxTokens: number }) {
  const pct = (day.total_tokens / maxTokens) * 100;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-muted-foreground">{day.date}</span>
        <span className="text-muted-foreground">
          {formatNumber(day.total_tokens)} tokens · {day.runs} runs · ${day.cost.toFixed(4)}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}