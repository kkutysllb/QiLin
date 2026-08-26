"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BarChart3Icon,
  BotIcon,
  CalendarIcon,
  CoinsIcon,
  CpuIcon,
  DatabaseIcon,
  RefreshCwIcon,
  WrenchIcon,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchTokenUsageStats,
  fetchTokenUsageTimeseries,
  type MonthFilter,
  type TokenUsageStats,
  type TokenUsageTimeseriesItem,
} from "@/core/api/token-usage";
import { useI18n } from "@/core/i18n/hooks";
import { formatTokenCount } from "@/core/messages/usage";
import { loadModels } from "@/core/models/api";
import type { Model } from "@/core/models/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Chart helpers
// ---------------------------------------------------------------------------

/**
 * Wrap Recharts ResponsiveContainer so the chart is only mounted after the
 * parent has been laid out. This avoids the v3 `width(-1)/height(-1)` warning
 * that ResizeObserver emits on the very first frame.
 */
function ResponsiveChart({ children }: { children: React.ReactElement }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!ready) {
    return <div className="h-full w-full" aria-hidden />;
  }
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={50} minWidth={0}>
      {children}
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | {
      status: "data";
      stats: TokenUsageStats;
      timeseries: TokenUsageTimeseriesItem[];
    };

interface TsDataRow {
  date: string;
  run_count: number;
  llm_call_count: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODEL_COLORS = [
  "#4d6bfe", "#06b6d4", "#f59e0b", "#10b981",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f97316", "#64748b",
];

const CALLER_CONFIG = [
  { key: "lead_agent" as const, color: "#8b5cf6", bg: "bg-violet-500/10", text: "text-violet-400" },
  { key: "subagent" as const, color: "#06b6d4", bg: "bg-cyan-500/10", text: "text-cyan-400" },
  { key: "middleware" as const, color: "#f59e0b", bg: "bg-amber-500/10", text: "text-amber-400" },
];

function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtPct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "0%";
  const pct = (numerator / denominator) * 100;
  return `${pct.toFixed(1)}%`;
}

function getCurrentBeijingMonth(): { year: number; month: number } {
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 3600_000);
  return { year: bj.getUTCFullYear(), month: bj.getUTCMonth() + 1 };
}

function fillDateRange(items: TokenUsageTimeseriesItem[]): TsDataRow[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [];
  const minDate = new Date(first.date);
  const maxDate = new Date(last.date);
  const dateMap = new Map(sorted.map((d) => [d.date, d]));

  const result: TsDataRow[] = [];
  const cur = new Date(minDate);
  while (cur <= maxDate) {
    const key = cur.toISOString().slice(0, 10);
    const existing = dateMap.get(key);
    result.push({
      date: `${cur.getMonth() + 1}-${cur.getDate()}`,
      run_count: existing?.run_count ?? 0,
      llm_call_count: existing?.llm_call_count ?? 0,
      total_tokens: existing?.total_tokens ?? 0,
      input_tokens: existing?.input_tokens ?? 0,
      output_tokens: existing?.output_tokens ?? 0,
      cache_read_tokens: (existing as Record<string, unknown> | undefined)?.cache_read_tokens as number ?? 0,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function formatShortDate(label: React.ReactNode): string {
  if (typeof label !== "string") return "";
  const parts = label.split("-");
  if (parts.length < 2) return label;
  return `${parseInt(parts[0] ?? "0")}-${parseInt(parts[1] ?? "0")}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-4 bg-card rounded-xl border border-border/40 px-5 py-4 min-w-[200px]">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", accent)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-xl font-bold font-mono tracking-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function ModelSection({
  model,
  colorIdx,
  tsData,
  inputTokens,
  outputTokens,
  totalTokens,
  totalCalls,
  totalLlmCalls,
  cacheReadTokens,
}: {
  model: string;
  colorIdx: number;
  tsData: TsDataRow[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCalls: number;
  totalLlmCalls: number;
  cacheReadTokens: number;
}) {
  const { t } = useI18n();
  const color = MODEL_COLORS[colorIdx % MODEL_COLORS.length];

  const labelInterval = tsData.length > 15
    ? Math.ceil(tsData.length / 12)
    : tsData.length > 7
      ? 1
      : 0;

  const tickAngle = tsData.length > 10 ? -40 : 0;
  const bottomMargin = tickAngle !== 0 ? 24 : 0;

  const chartTickStyle = { fontSize: 10, fill: "var(--muted-foreground)" };
  const tiltedTickStyle = tickAngle !== 0
    ? { ...chartTickStyle, angle: tickAngle, textAnchor: "end" as const }
    : chartTickStyle;
  const tooltipStyle = {
    backgroundColor: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--foreground)",
  };

  return (
    <div className="bg-card rounded-xl border border-border/40 p-5">
      {/* Model header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-semibold">{model}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Tokens: <span className="font-mono font-medium text-foreground">{fmtNum(totalTokens)}</span></span>
          <span>{t.settings.tokenUsage.runsColumn}: <span className="font-mono font-medium text-foreground">{fmtNum(totalCalls)}</span></span>
          <span>API: <span className="font-mono font-medium text-foreground">{fmtNum(totalLlmCalls)}</span></span>
          <span className="hidden sm:inline">
            {t.tokenUsage.input}: <span className="font-mono font-medium text-foreground">{fmtNum(inputTokens)}</span>
          </span>
          <span className="hidden sm:inline">
            {t.tokenUsage.output}: <span className="font-mono font-medium text-foreground">{fmtNum(outputTokens)}</span>
          </span>
          {cacheReadTokens > 0 && (
            <span className="hidden sm:inline text-emerald-500">
              {t.settings.tokenUsage.cacheHit}: <span className="font-mono font-medium">{fmtNum(cacheReadTokens)}</span>
              <span className="text-muted-foreground ml-0.5">
                ({fmtPct(cacheReadTokens, inputTokens)})
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* API calls & task runs dual-axis chart */}
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground mb-1">
            API {t.settings.tokenUsage.runsColumn}
          </div>
          {tsData.length > 0 ? (
            <div className="h-[200px] w-full">
              <ResponsiveChart>
                <ComposedChart data={tsData} margin={{ top: 4, right: 8, bottom: bottomMargin, left: 0 }}>
                  <defs>
                    <linearGradient id={`area-calls-${colorIdx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`area-runs-${colorIdx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={tiltedTickStyle}
                    axisLine={false}
                    tickLine={false}
                    interval={labelInterval}
                    tickFormatter={formatShortDate}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ ...chartTickStyle, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v: number) => fmtNum(v)}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ ...chartTickStyle, fontSize: 10, fill: "#10b981" }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    tickFormatter={(v: number) => fmtNum(v)}
                  />
                  <Tooltip
                    cursor={{ fill: "transparent" }}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "var(--foreground)" }}
                    labelFormatter={formatShortDate}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10, paddingTop: 2 }}
                    iconSize={8}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="llm_call_count"
                    name="API"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill={`url(#area-calls-${colorIdx})`}
                    dot={false}
                    activeDot={{ r: 4, fill: "#f59e0b" }}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="run_count"
                    name={t.settings.tokenUsage.runsColumn}
                    stroke="#10b981"
                    strokeWidth={2}
                    fill={`url(#area-runs-${colorIdx})`}
                    dot={false}
                    activeDot={{ r: 4, fill: "#10b981" }}
                  />
                </ComposedChart>
              </ResponsiveChart>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">
              {t.settings.tokenUsage.noData}
            </div>
          )}
        </div>

        {/* Input/Output stacked bar chart */}
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground mb-1">
            {t.tokenUsage.input}/{t.tokenUsage.output}
          </div>
          {tsData.length > 0 ? (
            <div className="h-[200px] w-full">
              <ResponsiveChart>
                <BarChart data={tsData} margin={{ top: 4, right: 8, bottom: bottomMargin, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={tiltedTickStyle}
                    axisLine={false}
                    tickLine={false}
                    interval={labelInterval}
                    tickFormatter={formatShortDate}
                  />
                  <YAxis
                    tick={{ ...chartTickStyle, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v: number) => fmtNum(v)}
                  />
                  <Tooltip
                    cursor={{ fill: "transparent" }}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "var(--foreground)" }}
                    labelFormatter={formatShortDate}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 10, paddingTop: 2 }}
                    iconSize={8}
                  />
                  <Bar dataKey="input_tokens" name={t.tokenUsage.input} stackId="io" fill="#6366f1" maxBarSize={16} />
                  <Bar dataKey="output_tokens" name={t.tokenUsage.output} stackId="io" fill="#06b6d4" maxBarSize={16} />
                </BarChart>
              </ResponsiveChart>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">
              {t.settings.tokenUsage.noData}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cache Hit Section
// ---------------------------------------------------------------------------

function CacheHitSection({
  totalCacheRead,
  totalInput,
  byModel,
}: {
  totalCacheRead: number;
  totalInput: number;
  byModel: Record<string, { tokens: number; input_tokens: number; cache_read_tokens: number }>;
}) {
  const { t } = useI18n();
  const hitRate = totalInput > 0 ? (totalCacheRead / totalInput) * 100 : 0;
  const cacheMiss = Math.max(totalInput - totalCacheRead, 0);

  // Build pie-style data for per-model cache breakdown
  const modelEntries = Object.entries(byModel)
    .filter(([, d]) => d.cache_read_tokens > 0)
    .sort(([, a], [, b]) => b.cache_read_tokens - a.cache_read_tokens)
    .slice(0, 8);

  return (
    <div className="bg-card rounded-xl border border-border/40 p-5 space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
          <DatabaseIcon className="h-3.5 w-3.5 text-emerald-400" />
        </span>
        {t.settings.tokenUsage.cacheHitTitle}
      </h3>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/40 bg-background/50 px-4 py-3">
          <div className="text-xs text-muted-foreground">{t.settings.tokenUsage.cacheHitTokens}</div>
          <div className="text-lg font-bold font-mono text-emerald-500">{fmtNum(totalCacheRead)}</div>
        </div>
        <div className="rounded-lg border border-border/40 bg-background/50 px-4 py-3">
          <div className="text-xs text-muted-foreground">{t.settings.tokenUsage.cacheHitRate}</div>
          <div className="text-lg font-bold font-mono">{hitRate.toFixed(1)}%</div>
        </div>
        <div className="rounded-lg border border-border/40 bg-background/50 px-4 py-3">
          <div className="text-xs text-muted-foreground">{t.settings.tokenUsage.cacheMiss}</div>
          <div className="text-lg font-bold font-mono">{fmtNum(cacheMiss)}</div>
        </div>
        <div className="rounded-lg border border-border/40 bg-background/50 px-4 py-3">
          <div className="text-xs text-muted-foreground">{t.settings.tokenUsage.cacheSavedHint}</div>
          <div className="text-lg font-bold font-mono text-emerald-500">{fmtNum(totalCacheRead)}</div>
        </div>
      </div>

      {/* Hit-rate progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t.settings.tokenUsage.cacheHitRate}</span>
          <span className="font-mono">{fmtNum(totalCacheRead)} / {fmtNum(totalInput)}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
            style={{ width: `${Math.min(hitRate, 100)}%` }}
          />
        </div>
      </div>

      {/* Per-model cache breakdown */}
      {modelEntries.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{t.settings.tokenUsage.byModel}</div>
          <div className="space-y-1.5">
            {modelEntries.map(([model, data], idx) => {
              const modelHitRate = data.input_tokens > 0
                ? (data.cache_read_tokens / data.input_tokens) * 100
                : 0;
              const color = MODEL_COLORS[idx % MODEL_COLORS.length];
              return (
                <div key={model} className="flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs text-muted-foreground min-w-0 truncate flex-1">
                    {model}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground shrink-0">
                    {fmtNum(data.cache_read_tokens)}
                  </span>
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted shrink-0">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(modelHitRate, 100)}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-xs font-mono shrink-0 w-12 text-right">
                    {modelHitRate.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------

export function TokenUsageDashboard() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<MonthFilter>(getCurrentBeijingMonth());
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [models, setModels] = useState<Model[]>([]);
  const [monthsOpen, setMonthsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const monthOptions = useMemo(() => {
    const opts: { y: number; m: number; label: string }[] = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const label = `${dt.getFullYear()} - ${dt.getMonth() + 1}月`;
      if (!opts.some((o) => o.y === dt.getFullYear() && o.m === dt.getMonth() + 1)) {
        opts.push({ y: dt.getFullYear(), m: dt.getMonth() + 1, label });
      }
    }
    return opts;
  }, []);

  const filterLabel = `${filter.year} - ${filter.month}月`;

  const modelDisplayNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of models) {
      map.set(m.name, m.display_name || m.name);
    }
    return map;
  }, [models]);

  const resolveModelDisplay = useCallback(
    (raw: string) => {
      const direct = modelDisplayNameMap.get(raw);
      if (direct) return direct;
      if (raw === "unknown" && modelDisplayNameMap.size >= 1) {
        return modelDisplayNameMap.values().next().value ?? raw;
      }
      return raw;
    },
    [modelDisplayNameMap],
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoadState({ status: "loading" });
    else setRefreshing(true);
    try {
      const [stats, timeseries, modelsData] = await Promise.all([
        fetchTokenUsageStats(filter),
        fetchTokenUsageTimeseries(31, filter),
        loadModels(),
      ]);
      setModels(modelsData.models);
      if (stats.total_runs === 0) {
        setLoadState({ status: "empty" });
      } else {
        setLoadState({ status: "data", stats, timeseries });
      }
    } catch (err) {
      if (!silent) {
        setLoadState({
          status: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh every 5 minutes (silent)
  useEffect(() => {
    const interval = setInterval(() => {
      void load(true);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const modelEntries = useMemo(() => {
    if (loadState.status !== "data") return [];
    return Object.entries(loadState.stats.by_model).sort(
      ([, a], [, b]) => b.tokens - a.tokens,
    );
  }, [loadState]);

  const modelTimeseries = useMemo(() => {
    if (loadState.status !== "data") return {};
    const byModel: Record<string, TokenUsageTimeseriesItem[]> = {};
    for (const item of loadState.timeseries) {
      const m = item.model_name;
      byModel[m] ??= [];
      byModel[m].push(item);
    }
    const result: Record<string, TsDataRow[]> = {};
    for (const [model, items] of Object.entries(byModel)) {
      result[model] = fillDateRange(items);
    }
    return result;
  }, [loadState]);

  const currentBjMonth = getCurrentBeijingMonth();

  // --- Loading ---
  if (loadState.status === "loading") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3 min-w-[200px]">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Error ---
  if (loadState.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="mb-3 rounded-full bg-rose-500/10 p-3">
          <RefreshCwIcon className="h-6 w-6 text-rose-400" />
        </div>
        <p className="text-sm text-muted-foreground">{loadState.message}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-400 transition-colors hover:bg-rose-500/20"
        >
          <RefreshCwIcon className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  // --- Empty ---
  if (loadState.status === "empty") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="mb-3 rounded-full bg-muted p-3">
          <BarChart3Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t.settings.tokenUsage.noData}</p>
      </div>
    );
  }

  const { stats } = loadState;

  return (
    <div className="space-y-5">
      {/* Inline toolbar: month selector + refresh */}
      <div className="flex items-center justify-end gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMonthsOpen(!monthsOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border/50 hover:bg-muted/50 transition-colors"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>{filterLabel}</span>
            <svg className={cn("w-3.5 h-3.5 transition-transform", monthsOpen && "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {monthsOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border/50 rounded-lg shadow-xl py-1 min-w-[160px] max-h-[280px] overflow-auto">
              <button
                type="button"
                onClick={() => {
                  setFilter(getCurrentBeijingMonth());
                  setMonthsOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors",
                  filter.year === currentBjMonth.year && filter.month === currentBjMonth.month && "text-indigo-400 font-medium",
                )}
              >
                当月
              </button>
              <div className="border-t border-border/30 my-1" />
              {monthOptions.map((opt) => (
                <button
                  type="button"
                  key={`${opt.y}-${opt.m}`}
                  onClick={() => {
                    setFilter({ year: opt.y, month: opt.m });
                    setMonthsOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors",
                    filter.year === opt.y && filter.month === opt.m && "text-indigo-400 font-medium",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
          title={t.toolbar.refresh}
        >
          <RefreshCwIcon className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </button>
      </div>

      {/* Hint */}
      <div className="text-xs text-muted-foreground">
        {t.settings.tokenUsage.timezoneHint}
      </div>

      {/* Summary cards */}
      <div className="flex flex-wrap gap-3">
        <SummaryCard
          label={t.settings.tokenUsage.summaryTotalRuns}
          value={fmtNum(stats.total_runs)}
          sub={filterLabel}
          icon={<Zap className="w-5 h-5 text-indigo-400" />}
          accent="bg-indigo-500/10"
        />
        <SummaryCard
          label={t.settings.tokenUsage.summaryApiCalls}
          value={fmtNum(stats.total_llm_call_count)}
          sub={filterLabel}
          icon={<Zap className="w-5 h-5 text-violet-400" />}
          accent="bg-violet-500/10"
        />
        <SummaryCard
          label={t.tokenUsage.input}
          value={fmtNum(stats.total_input_tokens)}
          icon={<ArrowDownIcon className="w-5 h-5 text-cyan-400" />}
          accent="bg-cyan-500/10"
        />
        <SummaryCard
          label={t.tokenUsage.output}
          value={fmtNum(stats.total_output_tokens)}
          icon={<ArrowUpIcon className="w-5 h-5 text-amber-400" />}
          accent="bg-amber-500/10"
        />
        <SummaryCard
          label={t.tokenUsage.total}
          value={fmtNum(stats.total_tokens)}
          icon={<CoinsIcon className="w-5 h-5 text-emerald-400" />}
          accent="bg-emerald-500/10"
        />
      </div>

      {/* Cache hit statistics */}
      <CacheHitSection
        totalCacheRead={stats.total_cache_read_tokens}
        totalInput={stats.total_input_tokens}
        byModel={stats.by_model}
      />

      {/* Per-model sections */}
      {modelEntries.length > 0 ? (
        <div className="space-y-4">
          {modelEntries.map(([model, data], idx) => (
            <ModelSection
              key={model}
              model={resolveModelDisplay(model)}
              colorIdx={idx}
              tsData={modelTimeseries[model] ?? []}
              inputTokens={data.input_tokens}
              outputTokens={data.output_tokens}
              totalTokens={data.tokens}
              totalCalls={data.runs}
              totalLlmCalls={data.llm_call_count}
              cacheReadTokens={data.cache_read_tokens}
            />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-muted-foreground text-sm">
          {t.settings.tokenUsage.noData}
        </div>
      )}

      {/* By Caller Section */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/10">
            <BotIcon className="h-3.5 w-3.5 text-cyan-400" />
          </span>
          {t.settings.tokenUsage.byCaller}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {CALLER_CONFIG.map((cfg) => {
            const tokens = stats.by_caller[cfg.key];
            const callerTotal = Math.max(
              stats.by_caller.lead_agent + stats.by_caller.subagent + stats.by_caller.middleware,
              1,
            );
            const pct = Math.max((tokens / callerTotal) * 100, 2);
            const label =
              cfg.key === "lead_agent"
                ? t.settings.tokenUsage.leadAgent
                : cfg.key === "subagent"
                  ? t.settings.tokenUsage.subagent
                  : t.settings.tokenUsage.middleware;
            return (
              <div key={cfg.key} className="rounded-xl border border-border/40 bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", cfg.bg)}>
                    {cfg.key === "lead_agent" ? (
                      <CpuIcon className={cn("h-3.5 w-3.5", cfg.text)} />
                    ) : cfg.key === "subagent" ? (
                      <BotIcon className={cn("h-3.5 w-3.5", cfg.text)} />
                    ) : (
                      <WrenchIcon className={cn("h-3.5 w-3.5", cfg.text)} />
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <div className="font-mono text-lg font-bold">{formatTokenCount(tokens)}</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: cfg.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
