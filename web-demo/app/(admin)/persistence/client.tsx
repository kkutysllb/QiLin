'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Database, HardDrive, Folder, FileText, AlertCircle } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import type { PersistenceStatus, PersistenceUsage } from '@/lib/types/persistence';

interface Props {
  initialStatus: PersistenceStatus | null;
  initialUsage: PersistenceUsage | null;
}

export function PersistenceClient({ initialStatus, initialUsage }: Props) {
  if (!initialStatus) {
    return (
      <Alert variant="destructive">
        <AlertTitle>无法加载持久化状态</AlertTitle>
        <AlertDescription>请检查 gateway 连接</AlertDescription>
      </Alert>
    );
  }

  const s = initialStatus;
  const db = s.database;
  const events = s.run_events;
  const memory = s.memory;
  const sandbox = s.sandbox_data;

  // 计算 usage 总和
  const totalDirs = initialUsage?.directories.reduce(
    (acc, d) => ({ bytes: acc.bytes + d.size_bytes, count: acc.count + 1 }),
    { bytes: 0, count: 0 }
  ) ?? { bytes: 0, count: 0 };

  return (
    <div className="space-y-6">
      {/* 数据库 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-qilin-500/10">
                <Database className="h-5 w-5 text-qilin-400" />
              </div>
              <div>
                <CardTitle>数据库</CardTitle>
                <CardDescription>
                  Backend: <span className="font-mono">{db.backend}</span>
                  {db.sqlite_dir && (
                    <span className="ml-2 text-muted-foreground">({db.sqlite_dir})</span>
                  )}
                </CardDescription>
              </div>
            </div>
            <Badge variant={db.persisted ? 'success' : 'destructive'}>
              {db.persisted ? 'persisted' : 'in-memory'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Metric label="Threads" value={db.thread_count.toLocaleString()} />
            <Metric label="Checkpoints" value={db.checkpoint_count.toLocaleString()} />
            <Metric label="Runs" value={db.run_count.toLocaleString()} />
            <Metric label="DB Size" value={formatBytes(db.db_size_bytes)} />
          </div>
        </CardContent>
      </Card>

      {/* Run Events */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Run Events Stream</CardTitle>
              <CardDescription className="text-xs">
                Backend: <span className="font-mono">{events.backend}</span>
              </CardDescription>
            </div>
            <Badge variant={events.persisted ? 'success' : 'warning'}>
              {events.persisted ? 'persisted' : 'volatile'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Metric label="Events" value={events.event_count.toLocaleString()} />
            {events.hint && (
              <Alert className="flex-1">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{events.hint}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Memory */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Memory Storage</CardTitle>
              <CardDescription className="text-xs font-mono">{memory.memory_file}</CardDescription>
            </div>
            <div className="flex gap-1">
              <Badge variant={memory.enabled ? 'success' : 'outline'}>
                {memory.enabled ? 'enabled' : 'disabled'}
              </Badge>
              <Badge variant={memory.persisted ? 'success' : 'warning'}>
                {memory.persisted ? 'persisted' : 'volatile'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Metric label="Memory File Size" value={formatBytes(memory.file_size_bytes)} />
        </CardContent>
      </Card>

      {/* Sandbox Data */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Sandbox Data</CardTitle>
              <CardDescription className="text-xs font-mono">
                {sandbox.threads_root}
              </CardDescription>
            </div>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <Metric label="Total Size" value={formatBytes(sandbox.total_size_bytes ?? 0)} />
        </CardContent>
      </Card>

      {/* Directory Breakdown */}
      {initialUsage && initialUsage.directories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">存储目录分布</CardTitle>
            <CardDescription className="text-xs">
              共 {totalDirs.count} 个目录 · 合计 {formatBytes(totalDirs.bytes)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {initialUsage.directories.map((d) => {
              const pct = totalDirs.bytes > 0 ? (d.size_bytes / totalDirs.bytes) * 100 : 0;
              return (
                <div key={d.path} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono">{d.path}</span>
                    </div>
                    <span className="shrink-0 text-muted-foreground">
                      {formatBytes(d.size_bytes)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{d.label}</span>
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                  <Progress value={pct} className="h-1" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-medium">{value}</p>
    </div>
  );
}