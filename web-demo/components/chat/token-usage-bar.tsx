'use client';
import { Progress } from '@/components/ui/progress';

export function TokenUsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
      <span className="shrink-0">Token</span>
      <Progress value={pct} className="h-1.5 max-w-xs" />
      <span className="shrink-0">
        {used.toLocaleString()} / {total.toLocaleString()}
      </span>
    </div>
  );
}
