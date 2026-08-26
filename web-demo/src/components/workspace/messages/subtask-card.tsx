"use client";

import {
  AlertCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  Loader2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { useI18n } from "@/core/i18n/hooks";
import { hasToolCalls } from "@/core/messages/utils";
import {
  streamdownPluginsWithoutRawHtml,
  streamdownWordAnimation,
} from "@/core/streamdown";
import {
  SafeStreamdown,
  toStreamdownComponents,
} from "@/core/streamdown/components";
import { useSubtask } from "@/core/tasks/context";
import { explainLastToolCall } from "@/core/tools/utils";
import { cn } from "@/lib/utils";

import { CitationLink } from "../citations/citation-link";
import { FlipDisplay } from "../flip-display";

import { MarkdownContent } from "./markdown-content";

function statusMeta(
  status: SubtaskStatus,
  t: ReturnType<typeof useI18n>["t"],
): { label: string; color: string } {
  switch (status) {
    case "in_progress":
      return { label: t.subtasks.in_progress, color: "text-blue-500" };
    case "completed":
      return { label: t.subtasks.completed, color: "text-emerald-500" };
    case "failed":
      return { label: t.subtasks.failed, color: "text-rose-500" };
    default:
      return { label: t.subtasks.subtask, color: "text-muted-foreground" };
  }
}

/**
 * SubtaskCard — a subagent execution card in the new message style.
 * Slim bordered card, status icon + description + status label on the
 * header row, expandable prompt / result below.
 */
export function SubtaskCard({
  className,
  taskId,
  isLoading,
}: {
  className?: string;
  taskId: string;
  isLoading: boolean;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const task = useSubtask(taskId);

  // The subtask is registered into context via a useEffect in MessageFeed,
  // so on the very first render cycle the task may not exist yet.  Compute
  // all derived values before any conditional return so hooks order stays
  // stable, then branch in JSX.
  const status = task?.status ?? "in_progress";
  const meta = statusMeta(status, t);

  const icon = useMemo(() => {
    if (status === "completed") return <CheckIcon className="size-3.5" />;
    if (status === "failed") return <AlertCircleIcon className="size-3.5" />;
    return <Loader2Icon className="size-3.5 animate-spin" />;
  }, [status]);

  // Lightweight loading placeholder for the gap between first render and
  // the useEffect in MessageFeed registering the subtask.
  if (!task) {
    return (
      <div
        className={cn(
          "border-border/70 bg-background/40 flex items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-2 text-sm",
          className,
        )}
      >
        <ClipboardListIcon className="text-muted-foreground size-4 shrink-0" />
        <Loader2Icon className="text-muted-foreground size-3.5 animate-spin" />
        <span className="text-muted-foreground">{t.subtasks.subtask}</span>
      </div>
    );
  }

  const active = status === "in_progress";

  return (
    <div
      className={cn(
        "border-border/70 bg-background/40 overflow-hidden rounded-lg border transition-colors",
        active && "border-blue-500/25 bg-blue-500/[0.03]",
        status === "failed" && "border-rose-500/25",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="hover:bg-muted/40 flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm transition-colors"
      >
        <ClipboardListIcon className="text-muted-foreground size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {active ? (
            <Shimmer duration={3} spread={3}>
              {task.description}
            </Shimmer>
          ) : (
            task.description
          )}
        </span>
        <span className={cn("flex items-center gap-1 text-xs font-medium", meta.color)}>
          {icon}
          {meta.label}
        </span>
        <ChevronRightIcon
          className={cn(
            "text-muted-foreground size-3.5 transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-border/60 space-y-3 px-3 py-2.5">
          {task.prompt && (
            <div>
              <div className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wider uppercase">
                任务
              </div>
              <SafeStreamdown
                {...streamdownPluginsWithoutRawHtml}
                animated={streamdownWordAnimation}
                components={toStreamdownComponents({ a: CitationLink })}
                isAnimating={isLoading}
              >
                {task.prompt}
              </SafeStreamdown>
            </div>
          )}

          {active && task.latestMessage && hasToolCalls(task.latestMessage) && (
            <div className="flex items-center gap-2 text-xs">
              <Loader2Icon className="size-3 animate-spin text-blue-500" />
              <span className="text-muted-foreground">
                {explainLastToolCall(task.latestMessage, t)}
              </span>
            </div>
          )}

          {status === "completed" && task.result && (
            <div>
              <div className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wider uppercase">
                结果
              </div>
              <MarkdownContent content={task.result} isLoading={false} />
            </div>
          )}

      {status === "failed" && task.error && (
        <div className="text-rose-500 text-xs leading-relaxed">{task.error}</div>
      )}

      {!active && !task.result && !task.error && (
        <div className="text-muted-foreground text-xs">
          <FlipDisplay uniqueKey={task.latestMessage?.id ?? ""}>
            {task.latestMessage
              ? explainLastToolCall(task.latestMessage, t)
              : t.subtasks.completed}
          </FlipDisplay>
        </div>
      )}
        </div>
      )}
    </div>
  );
}

type SubtaskStatus = string;
