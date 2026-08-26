"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BrainIcon,
  DatabaseIcon,
  FolderIcon,
  HardDriveIcon,
  Loader2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loadPersistenceStatus } from "@/core/persistence/api";
import { formatBytes } from "@/core/persistence/format";
import type {
  DatabaseStatus,
  PersistenceStatusResponse,
  RunEventsStatus,
} from "@/core/persistence/types";

const DB_LABEL: Record<DatabaseStatus["backend"], string> = {
  memory: "内存（不持久化）",
  sqlite: "SQLite",
  postgres: "PostgreSQL",
};

const EVENTS_LABEL: Record<RunEventsStatus["backend"], string> = {
  memory: "内存（重启丢失）",
  db: "数据库",
  jsonl: "JSONL 文件",
};

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function PersistedBadge({ persisted }: { persisted: boolean }) {
  return (
    <Badge variant={persisted ? "default" : "secondary"}>
      {persisted ? "已持久化" : "未持久化"}
    </Badge>
  );
}

export function PersistenceStatusDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["persistence-status"],
    queryFn: loadPersistenceStatus,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        加载持久化状态…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        持久化状态加载失败
      </div>
    );
  }

  const s: PersistenceStatusResponse = data;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <DatabaseIcon className="size-4" /> 数据库
            <PersistedBadge persisted={s.database.persisted} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <StatRow label="后端" value={DB_LABEL[s.database.backend]} />
          {s.database.backend !== "memory" && (
            <>
              <StatRow label="会话数" value={s.database.thread_count} />
              <StatRow label="Checkpoint" value={s.database.checkpoint_count} />
              <StatRow label="运行记录" value={s.database.run_count} />
              <StatRow label="库文件大小" value={formatBytes(s.database.db_size_bytes)} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <HardDriveIcon className="size-4" /> 运行事件
            <PersistedBadge persisted={s.run_events.persisted} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <StatRow label="后端" value={EVENTS_LABEL[s.run_events.backend]} />
          <StatRow label="事件数" value={s.run_events.event_count} />
          {s.run_events.hint && (
            <p className="mt-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
              ⚠️ {s.run_events.hint}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <BrainIcon className="size-4" /> 记忆
            <PersistedBadge persisted={s.memory.persisted} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <StatRow label="已启用" value={s.memory.enabled ? "是" : "否"} />
          {s.memory.memory_file && (
            <StatRow label="文件大小" value={formatBytes(s.memory.file_size_bytes)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FolderIcon className="size-4" /> 沙箱数据
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <StatRow label="会话目录数" value={s.sandbox_data.thread_dir_count} />
          <StatRow label="总占用" value={formatBytes(s.sandbox_data.total_size_bytes)} />
        </CardContent>
      </Card>
    </div>
  );
}
