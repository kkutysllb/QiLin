"use client";

import {
  ClockIcon,
  PauseIcon,
  PlayIcon,
  TerminalIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  pauseScheduledTask,
  resumeScheduledTask,
  triggerScheduledTask,
} from "@/core/crons/api";
import type { ScheduledTask, ScheduledTaskStatus } from "@/core/crons/types";
import { useI18n } from "@/core/i18n/hooks";

interface CronCardProps {
  task: ScheduledTask;
  onRefresh: () => void;
  onDelete: (taskId: string, title: string) => void;
}

const STATUS_STYLES: Record<ScheduledTaskStatus, string> = {
  enabled: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  paused: "bg-muted text-muted-foreground border-transparent",
  running: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  completed: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
  failed: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  cancelled: "bg-muted text-muted-foreground border-transparent",
};

function formatNextRun(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function CronCard({ task, onRefresh, onDelete }: CronCardProps) {
  const { t } = useI18n();
  const statusKey = `status${task.status.charAt(0).toUpperCase()}${task.status.slice(1)}` as `status${Capitalize<ScheduledTaskStatus>}`;
  const statusLabel = t.crons[statusKey] ?? task.status;

  const cronExpr =
    task.schedule_type === "cron"
      ? (task.schedule_spec.cron as string | undefined) ?? ""
      : t.crons.scheduleOnce;

  const isActive = task.status === "enabled" || task.status === "running";

  const handlePauseResume = async () => {
    try {
      if (isActive) {
        await pauseScheduledTask(task.task_id);
      } else {
        await resumeScheduledTask(task.task_id);
      }
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Operation failed");
    }
  };

  const handleTrigger = async () => {
    try {
      await triggerScheduledTask(task.task_id);
      toast.success(t.crons.triggerSuccess);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Trigger failed");
    }
  };

  return (
    <div className="group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-all duration-200 hover:bg-accent/50 hover:shadow-sm">
      {/* Icon */}
      <div className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
        <ClockIcon className="size-4.5" />
      </div>

      {/* Title + prompt */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{task.title}</span>
          <Badge
            variant="secondary"
            className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[task.status]}`}
          >
            {statusLabel}
          </Badge>
        </div>
        <p className="text-muted-foreground/70 mt-0.5 truncate text-xs">
          {task.prompt}
        </p>
        <div className="text-muted-foreground/50 mt-0.5 truncate text-[11px]">
          {t.crons.nextRun}: {formatNextRun(task.next_run_at)}
        </div>
      </div>

      {/* Cron expression */}
      <div className="hidden shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground/60 sm:flex">
        <TerminalIcon className="size-3" />
        {cronExpr}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 hover:bg-blue-500/10 hover:text-blue-500"
                onClick={handleTrigger}
                disabled={task.status === "running"}
              >
                <ZapIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.crons.trigger}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 hover:bg-amber-500/10 hover:text-amber-500"
                onClick={handlePauseResume}
                disabled={task.status === "running"}
              >
                {isActive ? (
                  <PauseIcon className="size-3.5" />
                ) : (
                  <PlayIcon className="size-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isActive ? t.crons.pause : t.crons.resume}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onDelete(task.task_id, task.title)}
                disabled={task.status === "running"}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t.crons.deleteJob}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
