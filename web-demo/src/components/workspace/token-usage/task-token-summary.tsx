"use client";

import type { Message } from "@langchain/langgraph-sdk";
import { CoinsIcon } from "lucide-react";
import { useMemo } from "react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  accumulateUsageDetail,
  formatTokenCount,
} from "@/core/messages/usage";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

interface TaskTokenSummaryProps {
  messages: Message[];
  className?: string;
}

/**
 * Slim bar rendered under the chat input box on the new-task / chat page.
 *
 * Compact bar shows: title + total tokens + input/output/cache hit rate.
 * Hover reveals a popover with mini-cards (call count, input, output,
 * cache hit rate), saved tokens, and inline SVG charts (token split
 * donut + per-model usage bars).
 */
export function TaskTokenSummary({
  messages,
  className,
}: TaskTokenSummaryProps) {
  const { t } = useI18n();
  const detail = useMemo(() => accumulateUsageDetail(messages), [messages]);

  const total =
    (detail.total?.inputTokens ?? 0) + (detail.total?.outputTokens ?? 0);
  const cacheRead = detail.total?.cacheReadTokens ?? 0;
  const inputTokens = detail.total?.inputTokens ?? 0;
  const cacheHitRate =
    inputTokens > 0 ? Math.round((cacheRead / inputTokens) * 100) : 0;

  const hasData = detail.callCount > 0;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={t.tokenUsage.taskTitle}
          className={cn(
            "flex h-7 w-full items-center justify-between gap-3 rounded-full border px-3 text-xs",
            "bg-background/40 text-muted-foreground hover:bg-background/70 hover:text-foreground",
            "transition-colors",
            !hasData && "opacity-70",
            className,
          )}
        >
          <span className="flex items-center gap-1.5 font-medium">
            <CoinsIcon className="size-3.5 text-amber-500" />
            {t.tokenUsage.taskTitle}
          </span>
          <span className="flex items-center gap-2 font-mono">
            {hasData ? (
              <>
                <span>
                  {t.tokenUsage.input} {formatTokenCount(inputTokens)}
                </span>
                <span className="opacity-40">·</span>
                <span>
                  {t.tokenUsage.output}{" "}
                  {formatTokenCount(detail.total?.outputTokens ?? 0)}
                </span>
                {cacheRead > 0 && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="text-emerald-500">
                      {t.tokenUsage.taskCacheHitRate} {cacheHitRate}%
                    </span>
                  </>
                )}
              </>
            ) : (
              <span>{t.tokenUsage.taskEmpty}</span>
            )}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="center"
        side="top"
        sideOffset={8}
        className="w-[360px] p-4"
      >
        <TaskTokenSummaryPopover detail={detail} />
      </HoverCardContent>
    </HoverCard>
  );
}

interface PopoverProps {
  detail: ReturnType<typeof accumulateUsageDetail>;
}

function TaskTokenSummaryPopover({ detail }: PopoverProps) {
  const { t } = useI18n();
  const total = detail.total;
  const inputTokens = total?.inputTokens ?? 0;
  const outputTokens = total?.outputTokens ?? 0;
  const cacheRead = total?.cacheReadTokens ?? 0;
  const cacheHitRate =
    inputTokens > 0 ? Math.round((cacheRead / inputTokens) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <CoinsIcon className="size-4 text-amber-500" />
          {t.tokenUsage.taskTitle}
        </div>
        <ModelDonut input={inputTokens} output={outputTokens} cache={cacheRead} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MicroCard
          label={t.tokenUsage.taskCalls}
          value={detail.callCount.toString()}
        />
        <MicroCard
          label={t.tokenUsage.input}
          value={formatTokenCount(inputTokens)}
        />
        <MicroCard
          label={t.tokenUsage.output}
          value={formatTokenCount(outputTokens)}
        />
        <MicroCard
          label={t.tokenUsage.taskCacheHitRate}
          value={cacheRead > 0 ? `${cacheHitRate}%` : "—"}
          accent={cacheRead > 0 ? "emerald" : "muted"}
        />
      </div>

      {cacheRead > 0 && (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-xs">
          <span className="text-emerald-600 dark:text-emerald-400">
            {t.tokenUsage.taskCacheSaved}：
          </span>
          <span className="ml-1 font-mono font-medium">
            {formatTokenCount(cacheRead)}
          </span>
        </div>
      )}

      {detail.byModel.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
            {t.tokenUsage.taskByModel}
          </div>
          {detail.byModel.slice(0, 4).map((model) => (
            <ModelRow
              key={model.name}
              name={model.name}
              calls={model.calls}
              input={model.inputTokens}
              output={model.outputTokens}
              cache={model.cacheReadTokens}
              maxTotal={Math.max(
                ...detail.byModel.map(
                  (m) => m.inputTokens + m.outputTokens,
                ),
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MicroCard({
  label,
  value,
  accent = "default",
}: {
  label: string;
  value: string;
  accent?: "default" | "emerald" | "muted";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="rounded-md border bg-zinc-50/50 dark:bg-zinc-900/40 px-2.5 py-1.5">
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </div>
      <div className={cn("mt-0.5 font-mono text-sm font-semibold", accentClass)}>
        {value}
      </div>
    </div>
  );
}

/**
 * Compact SVG donut showing input / output / cache read split.
 * Renders inside a 28x28 circle so it stays on one line with the title.
 */
function ModelDonut({
  input,
  output,
  cache,
}: {
  input: number;
  output: number;
  cache: number;
}) {
  const freshInput = Math.max(input - cache, 0);
  const total = freshInput + output + cache;
  if (total === 0) return null;

  const r = 10;
  const cx = 14;
  const cy = 14;
  const c = 2 * Math.PI * r;
  const freshLen = (freshInput / total) * c;
  const outputLen = (output / total) * c;
  const cacheLen = (cache / total) * c;

  let offset = 0;
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label={`${input} ${output} ${cache}`.replace(/[^0-9 ]/g, "")}
    >
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-zinc-800/30"
        />
        {freshInput > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeDasharray={`${freshLen} ${c - freshLen}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="text-blue-500"
          />
        )}
        {output > 0 && (
          <>
            {(() => {
              offset += freshLen;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                  strokeDasharray={`${outputLen} ${c - outputLen}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  className="text-amber-500"
                />
              );
            })()}
          </>
        )}
        {cache > 0 && (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeDasharray={`${cacheLen} ${c - cacheLen}`}
            strokeDashoffset={-(offset + outputLen)}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="text-emerald-500"
          />
        )}
      </svg>
      <span className="font-mono text-xs font-semibold">
        {formatTokenCount(input + output)}
      </span>
    </div>
  );
}

function ModelRow({
  name,
  calls,
  input,
  output,
  cache,
  maxTotal,
}: {
  name: string;
  calls: number;
  input: number;
  output: number;
  cache: number;
  maxTotal: number;
}) {
  const total = input + output;
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-medium">{name}</span>
        <span className="text-muted-foreground font-mono">
          {calls}× · {formatTokenCount(total)}
          {cache > 0 && (
            <span className="ml-1 text-emerald-500">
              (-{formatTokenCount(cache)})
            </span>
          )}
        </span>
      </div>
      <div className="bg-muted-foreground/10 h-1.5 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-amber-500 to-emerald-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
