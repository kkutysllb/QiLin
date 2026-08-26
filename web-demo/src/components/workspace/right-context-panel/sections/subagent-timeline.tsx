"use client";

import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ClockIcon,
  CpuIcon,
  HashIcon,
  Loader2Icon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";

import type { Subtask } from "@/core/tasks/types";
import { cn } from "@/lib/utils";

/* ── Subagent Timeline ────────────────────────────────── */

export function SubagentTimeline({ task }: { task: Subtask }) {
  const steps = task.steps ?? [];
  const hasSteps = steps.length > 0;

  return (
    <div className="space-y-1">
      {hasSteps ? (
        <>
          {steps.map((step, i) => (
            <TimelineStep
              key={`${step.content.message_index ?? i}-${i}`}
              step={step}
              isLast={i === steps.length - 1}
            />
          ))}
        </>
      ) : (
        <div className="text-muted-foreground py-1 text-center text-[11px]">
          {task.status === "in_progress"
            ? "等待执行步骤…"
            : "无步骤数据"}
        </div>
      )}

      {/* Summary footer */}
      <TimelineFooter task={task} />
    </div>
  );
}

/* ── Timeline Step ────────────────────────────────────── */

function formatArgs(args: unknown): string {
  if (typeof args === "string") return args.slice(0, 60);
  if (args == null) return "";
  try {
    return JSON.stringify(args).slice(0, 60);
  } catch {
    return String(args).slice(0, 60);
  }
}

function TimelineStep({
  step,
  isLast,
}: {
  step: NonNullable<Subtask["steps"]>[number];
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = step.content;
  const isTool = content.kind === "tool";
  const toolCalls = content.tool_calls ?? [];
  const hasDetails =
    Boolean(content.text && content.text.length > 0) || toolCalls.length > 0;

  return (
    <div className="relative pl-4">
      {/* Vertical connector line */}
      {!isLast && (
        <div className="absolute top-4 bottom-0 left-[5px] w-px bg-border" />
      )}
      {/* Node dot */}
      <div
        className={cn(
          "absolute top-1.5 left-0 size-2.5 rounded-full border-2",
          isTool
            ? "border-blue-400 bg-blue-100 dark:bg-blue-950"
            : "border-emerald-400 bg-emerald-100 dark:bg-emerald-950",
        )}
      />

      <div className="pb-2">
        <button
          type="button"
          disabled={!hasDetails}
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex w-full items-start gap-1 text-left text-[11px]",
            hasDetails && "cursor-pointer hover:bg-muted/30",
          )}
        >
          {/* Step header — prefers the most specific signal: tool name(s),
              then any inline text, and finally a "thinking" placeholder
              so the row is always meaningful instead of "AI". */}
          <span className="flex shrink-0 items-center gap-0.5 font-medium">
            {isTool ? (
              <WrenchIcon className="text-blue-500 size-2.5" />
            ) : (
              <CpuIcon className="text-emerald-500 size-2.5" />
            )}
            {isTool
              ? (content.tool_name ??
                  toolCalls[0]?.name ??
                  "工具调用")
              : content.text && content.text.length > 0
                ? "思考中"
                : toolCalls.length > 0
                  ? `调用 ${toolCalls[0]?.name ?? "工具"}`
                  : "思考中…"}
            {!isTool && toolCalls.length > 0 && (
              <span className="text-muted-foreground">
                ({toolCalls.length})
              </span>
            )}
          </span>
          {hasDetails && (
            <ChevronRightIcon
              className={cn(
                "text-muted-foreground mt-0.5 size-2.5 shrink-0 transition-transform",
                expanded && "rotate-90",
              )}
            />
          )}
          <span className="text-muted-foreground min-w-0 flex-1 truncate">
            {content.text && content.text.length > 0
              ? content.text.slice(0, 80)
              : toolCalls.length > 0
                ? toolCalls
                    .map((tc) => `${tc.name}(${formatArgs(tc.args)})`)
                    .join(", ")
                    .slice(0, 80)
                : ""}
          </span>
        </button>

        {/* Expanded details */}
        {expanded && hasDetails && (
          <div className="mt-1 space-y-1.5 pl-4">
            {content.text && content.text.length > 0 && (
              <div className="text-muted-foreground whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                {content.text}
                {content.truncated && (
                  <span className="text-amber-500"> (已截断)</span>
                )}
              </div>
            )}
            {toolCalls.map((tc, idx) => (
              <div
                key={idx}
                className="rounded bg-muted/40 px-1.5 py-1 font-mono text-[10px]"
              >
                <span className="text-blue-500">{tc.name}</span>
                <span className="text-muted-foreground">(</span>
                <span className="text-muted-foreground/80">
                  {typeof tc.args === "string"
                    ? tc.args.slice(0, 120)
                    : JSON.stringify(tc.args).slice(0, 120)}
                  {tc.args_truncated && "…"}
                </span>
                <span className="text-muted-foreground">)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Timeline Footer ──────────────────────────────────── */

function TimelineFooter({ task }: { task: Subtask }) {
  const tokens = task.token_usage?.total_tokens;
  const duration = task.duration_ms;
  const durationSec = duration != null ? (duration / 1000).toFixed(1) : null;

  // If we have started_at and completed_at, compute duration
  let computedDuration: string | null = durationSec;
  if (!computedDuration && task.started_at && task.completed_at) {
    const diff = new Date(task.completed_at).getTime() - new Date(task.started_at).getTime();
    computedDuration = (diff / 1000).toFixed(1);
  }

  const hasFooterInfo = tokens != null || computedDuration != null || task.model_name;

  if (!hasFooterInfo && task.status !== "failed") return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-border/40 pt-1 text-[10px] text-muted-foreground">
      {task.model_name && (
        <span className="flex items-center gap-0.5">
          <CpuIcon className="size-2.5" />
          {task.model_name}
        </span>
      )}
      {tokens != null && (
        <span className="flex items-center gap-0.5">
          <HashIcon className="size-2.5" />
          {tokens.toLocaleString()} tokens
        </span>
      )}
      {computedDuration != null && (
        <span className="flex items-center gap-0.5">
          <ClockIcon className="size-2.5" />
          {computedDuration}s
        </span>
      )}
      <span
        className={cn(
          "flex items-center gap-0.5",
          task.status === "completed"
            ? "text-emerald-500"
            : task.status === "failed"
              ? "text-rose-500"
              : "text-amber-500",
        )}
      >
        {task.status === "completed" ? (
          <CheckCircle2Icon className="size-2.5" />
        ) : task.status === "failed" ? (
          <AlertCircleIcon className="size-2.5" />
        ) : (
          <Loader2Icon className="size-2.5 animate-spin" />
        )}
        {task.status === "completed"
          ? "completed"
          : task.status === "failed"
            ? "failed"
            : "running"}
      </span>
    </div>
  );
}
