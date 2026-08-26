"use client";

import { AlertTriangleIcon, ZapIcon, PlusIcon, RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteScheduledTask,
  fetchScheduledTasks,
} from "@/core/crons/api";
import type { ScheduledTask } from "@/core/crons/types";
import { useI18n } from "@/core/i18n/hooks";

import { CronCard } from "./cron-card";

export function CronGallery() {
  const { t } = useI18n();
  const router = useRouter();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScheduledTasks();
      setTasks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = () => {
    router.push("/workspace/chats/new?mode=cron");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteScheduledTask(deleteTarget.id);
      toast.success(t.crons.deleteSuccess);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="flex size-full flex-col">
      {/* Page header */}
      <div className="relative shrink-0 border-b bg-gradient-to-b from-muted/30 to-transparent">
        {/* Decorative background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 size-64 rounded-full bg-muted/30 blur-3xl" />
          <div className="absolute -bottom-16 left-1/3 size-48 rounded-full bg-muted/20 blur-3xl" />
        </div>

        <div className="relative flex items-center justify-between px-6 py-5">
          <div className="space-y-1.5">
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-foreground">
              <ZapIcon className="h-6 w-6" />
              <span>{t.crons.title}</span>
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              {t.crons.description}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {tasks.length > 0 && !loading && (
              <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                <span className="inline-flex size-2 rounded-full bg-foreground" />
                {tasks.length} {t.crons.jobCount}
              </div>
            )}
            <Button onClick={handleAdd} className="shadow-sm">
              <PlusIcon className="mr-1.5 h-4 w-4" />
              {t.crons.addJob}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Loading state */}
        {loading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg border bg-muted/30"
              />
            ))}
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <ZapIcon className="size-7" />
            </div>
            <p className="mb-3 text-sm font-medium text-destructive">{error}</p>
            <Button variant="outline" onClick={load}>
              <RefreshCwIcon className="mr-1.5 h-4 w-4" />
              {t.crons.retry}
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-muted blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-foreground ring-1 ring-border">
                <ZapIcon className="h-8 w-8" />
              </div>
            </div>
            <h3 className="text-lg font-semibold">{t.crons.emptyTitle}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {t.crons.emptyDescription}
            </p>
          </div>
        )}

        {/* Cards */}
        {!loading && !error && tasks.length > 0 && (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <CronCard
                key={task.task_id}
                task={task}
                onRefresh={load}
                onDelete={(id, title) => setDeleteTarget({ id, title })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="p-0 sm:max-w-md">
          <div className="h-1.5 w-full rounded-t-lg bg-gradient-to-r from-red-400 to-rose-400" />
          <DialogHeader className="px-6 pt-4">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                <AlertTriangleIcon className="h-4 w-4" />
              </span>
              {t.crons.deleteJob}
            </DialogTitle>
            <DialogDescription className="pl-10">
              {t.crons.deleteConfirm.replace("{name}", deleteTarget?.title ?? "")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-6 pb-5">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              className="shadow-sm"
            >
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
