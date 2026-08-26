"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderOpenIcon, Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { openFolder } from "@/core/desktop";
import { loadPersistenceUsage } from "@/core/persistence/api";
import { formatBytes } from "@/core/persistence/format";
import type { DirectoryUsage } from "@/core/persistence/types";

function Row({ dir }: { dir: DirectoryUsage }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{dir.label}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{dir.path}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm">{formatBytes(dir.size_bytes)}</span>
        <Button
          size="sm"
          variant="outline"
          className="gap-1"
          onClick={() => void openFolder(dir.path)}
        >
          <FolderOpenIcon className="size-3.5" />
          打开
        </Button>
      </div>
    </div>
  );
}

export function DataDirectoryTable() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["persistence-usage"],
    queryFn: loadPersistenceUsage,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        加载目录占用…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        目录占用加载失败
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <div className="border-b bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        数据目录占用（合计 {formatBytes(data.total_size_bytes)}）
      </div>
      <div className="px-3">
        {data.directories.map((d) => (
          <Row key={d.path} dir={d} />
        ))}
      </div>
    </div>
  );
}
