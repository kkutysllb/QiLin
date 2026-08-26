"use client";

import {
  ArrowRightIcon,
  BotIcon,
  CheckCircle2Icon,
  Loader2Icon,
  UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { listAgentsAsWorkers } from "@/core/agents/api";
import type { WorkerSpec } from "@/core/agents/types";
import { cn } from "@/lib/utils";

import { useConfigSection } from "./config/use-config-section";
import { SettingsSection } from "./settings-section";

/* ── types ────────────────────────────────────────────── */

interface TokenBudget {
  enabled: boolean;
  max_tokens: number;
  warn_threshold: number;
  hard_stop_threshold?: number;
  max_input_tokens?: number | null;
  max_output_tokens?: number | null;
  per_agent?: Record<string, unknown>;
}

interface SubagentsConfig {
  timeout_seconds: number;
  max_turns: number | null;
  max_total_per_run: number;
  token_budget?: TokenBudget;
  agents?: Record<string, unknown>;
  custom_agents?: Record<string, unknown>;
}

interface OrchestrationConfig {
  mode: "single" | "multi";
  max_concurrency: number;
  workers?: WorkerSpec[];
}

/* ── helpers ──────────────────────────────────────────── */

function pickNum(
  raw: string,
  fallback: number,
  opts?: { min?: number; max?: number },
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (opts?.min !== undefined && n < opts.min) return opts.min;
  if (opts?.max !== undefined && n > opts.max) return opts.max;
  return Math.trunc(n);
}

const labelCls = "text-sm font-medium leading-none";
const descCls = "mt-0.5 text-xs text-muted-foreground leading-relaxed";

/* ── main component ───────────────────────────────────── */

export function SubagentsSettingsPage() {
  return (
    <SettingsSection
      title="子代理与编排"
      description="配置子代理全局参数与多 Agent 编排模式。自定义代理请前往「代理」设置页统一管理。"
      icon={<UsersIcon className="h-5 w-5 text-primary" />}
    >
      <div className="space-y-6">
        <SubagentsForm />
        <OrchestrationForm />
      </div>
    </SettingsSection>
  );
}

/* ── subagents global form ────────────────────────────── */

function SubagentsForm() {
  const { data, loading, saving, save } = useConfigSection<SubagentsConfig>(
    "subagents",
    {
      timeout_seconds: 1800,
      max_turns: null,
      max_total_per_run: 6,
    },
  );
  const [timeoutSeconds, setTimeoutSeconds] = useState("");
  const [maxTurns, setMaxTurns] = useState("");
  const [maxTotalPerRun, setMaxTotalPerRun] = useState("");
  const [tbEnabled, setTbEnabled] = useState(false);
  const [tbMaxTokens, setTbMaxTokens] = useState("");
  const [tbWarnThreshold, setTbWarnThreshold] = useState("");

  useEffect(() => {
    setTimeoutSeconds(String(data.timeout_seconds ?? 1800));
    setMaxTurns(data.max_turns != null ? String(data.max_turns) : "");
    setMaxTotalPerRun(String(data.max_total_per_run ?? 6));
    setTbEnabled(data.token_budget?.enabled ?? false);
    setTbMaxTokens(String(data.token_budget?.max_tokens ?? 2000000));
    setTbWarnThreshold(String(data.token_budget?.warn_threshold ?? 0.7));
  }, [data]);

  const dirty =
    Number(timeoutSeconds) !== (data.timeout_seconds ?? 1800) ||
    Number(maxTurns || "0") !== (data.max_turns ?? 0) ||
    Number(maxTotalPerRun) !== (data.max_total_per_run ?? 6) ||
    tbEnabled !== (data.token_budget?.enabled ?? false) ||
    Number(tbMaxTokens) !== (data.token_budget?.max_tokens ?? 2000000) ||
    Number(tbWarnThreshold) !==
      (data.token_budget?.warn_threshold ?? 0.7);

  const handleSave = async () => {
    try {
      const prevTb = data.token_budget ??
        ({} as NonNullable<SubagentsConfig["token_budget"]>);
      const token_budget = {
        enabled: tbEnabled,
        max_tokens: pickNum(tbMaxTokens, 2000000, { min: 1000 }),
        warn_threshold: pickNum(tbWarnThreshold, 0.7, { min: 0, max: 1 }),
        ...(prevTb.hard_stop_threshold != null
          ? { hard_stop_threshold: prevTb.hard_stop_threshold }
          : {}),
        ...(prevTb.max_input_tokens != null
          ? { max_input_tokens: prevTb.max_input_tokens }
          : {}),
        ...(prevTb.max_output_tokens != null
          ? { max_output_tokens: prevTb.max_output_tokens }
          : {}),
        ...(prevTb.per_agent ? { per_agent: prevTb.per_agent } : {}),
      };
      const payload: SubagentsConfig = {
        timeout_seconds: pickNum(timeoutSeconds, 1800, { min: 1 }),
        max_turns: maxTurns.trim() ? pickNum(maxTurns, 1, { min: 1 }) : null,
        max_total_per_run: pickNum(maxTotalPerRun, 6, { min: 1, max: 50 }),
        token_budget,
        ...(data.agents ? { agents: data.agents } : {}),
        custom_agents: data.custom_agents ?? {},
      };
      await save(payload);
      toast.success("子代理参数已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const resetAll = () => {
    setTimeoutSeconds(String(data.timeout_seconds ?? 1800));
    setMaxTurns(data.max_turns != null ? String(data.max_turns) : "");
    setMaxTotalPerRun(String(data.max_total_per_run ?? 6));
    setTbEnabled(data.token_budget?.enabled ?? false);
    setTbMaxTokens(String(data.token_budget?.max_tokens ?? 2000000));
    setTbWarnThreshold(String(data.token_budget?.warn_threshold ?? 0.7));
  };

  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
        子代理全局参数
      </h3>
      <div className="divide-y overflow-hidden rounded-xl border">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            加载中…
          </div>
        ) : (
          <>
            <NumberRow
              label="默认超时（秒）"
              description="内置子代理的默认超时时间，自定义代理使用各自的超时（默认 1800 = 30 分钟）"
              value={timeoutSeconds}
              onChange={setTimeoutSeconds}
              placeholder="1800"
            />
            <NumberRow
              label="默认最大轮次"
              description="留空时各代理使用内置默认值（general-purpose=200, bash=60）。填写后将统一覆盖所有内置代理的最大轮次"
              value={maxTurns}
              onChange={setMaxTurns}
              placeholder="留空使用默认值"
            />
            <NumberRow
              label="单次运行最大委派数"
              description="单次 lead-agent 运行中允许的子代理委派总数（范围 1-50）"
              value={maxTotalPerRun}
              onChange={setMaxTotalPerRun}
              placeholder="6"
            />
            {/* Token 预算 */}
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className={labelCls}>启用 Token 预算</p>
                <p className={descCls}>
                  开启后对子代理的单次运行施加 token 总量上限，作为成本后隄
                </p>
              </div>
              <div className="shrink-0">
                <Switch
                  checked={tbEnabled}
                  onCheckedChange={setTbEnabled}
                  disabled={saving}
                />
              </div>
            </div>
            <NumberRow
              label="最大 Token 数"
              description="单次子代理运行允许的 token 总量上限（输入+输出），默认 2000000"
              value={tbMaxTokens}
              onChange={setTbMaxTokens}
              placeholder="2000000"
            />
            <NumberRow
              label="警告阈值"
              description="token 用量达到最大值的比例时触发软警告（0-1，默认 0.7 = 70%）"
              value={tbWarnThreshold}
              onChange={setTbWarnThreshold}
              placeholder="0.7"
            />
            {/* Custom agents 迁移提示 */}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className={labelCls}>自定义子代理</p>
                <p className={descCls}>
                  已迁移到「代理」设置页统一管理，在此创建的代理可直接加入编排
                </p>
              </div>
              <ArrowRightIcon className="text-muted-foreground size-4 shrink-0" />
            </div>
            <div className="flex gap-2 px-4 py-3">
              <Button
                size="sm"
                disabled={!dirty || saving}
                onClick={handleSave}
              >
                {saving ? "保存中…" : "应用并重启"}
              </Button>
              {dirty && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetAll}
                  disabled={saving}
                >
                  重置
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ── orchestration form ───────────────────────────────── */

function OrchestrationForm() {
  const { data, loading, saving, save } = useConfigSection<OrchestrationConfig>(
    "orchestration",
    { mode: "single", max_concurrency: 3 },
  );
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [maxConcurrency, setMaxConcurrency] = useState("");
  // Worker selection state: name -> { selected, role }
  const [workerSelections, setWorkerSelections] = useState<
    Record<string, { selected: boolean; role: string }>
  >({});
  const [availableWorkers, setAvailableWorkers] = useState<WorkerSpec[]>([]);
  const [workersDirty, setWorkersDirty] = useState(false);
  const [loadingWorkers, setLoadingWorkers] = useState(false);

  // Load workers from existing config + fetch available agents
  useEffect(() => {
    setMode(data.mode ?? "single");
    setMaxConcurrency(String(data.max_concurrency ?? 3));
    const configWorkers = data.workers ?? [];
    const initial: Record<string, { selected: boolean; role: string }> = {};
    for (const w of configWorkers) {
      initial[w.name] = {
        selected: true,
        role: w.role ?? "worker",
      };
    }
    setWorkerSelections(initial);
    setWorkersDirty(false);
  }, [data]);

  // Fetch available agents as potential workers
  useEffect(() => {
    if (!loading && mode === "multi") {
      setLoadingWorkers(true);
      listAgentsAsWorkers()
        .then((specs) => {
          setAvailableWorkers(specs);
          // Merge any config workers not in the agents list (e.g. hand-written)
          setWorkerSelections((prev) => {
            const merged = { ...prev };
            for (const s of specs) {
              merged[s.name] ??= { selected: false, role: s.role ?? "worker" };
            }
            return merged;
          });
        })
        .catch(() => {
          // Silently fail — the user can still use the saved config
        })
        .finally(() => setLoadingWorkers(false));
    }
  }, [loading, mode]);

  const dirty =
    mode !== (data.mode ?? "single") ||
    Number(maxConcurrency) !== (data.max_concurrency ?? 3) ||
    workersDirty;

  const toggleWorker = (name: string) => {
    setWorkerSelections((prev) => ({
      ...prev,
      [name]: {
        selected: !prev[name]?.selected,
        role: prev[name]?.role ?? "worker",
      },
    }));
    setWorkersDirty(true);
  };

  const setWorkerRole = (name: string, role: string) => {
    setWorkerSelections((prev) => ({
      ...prev,
      [name]: {
        selected: prev[name]?.selected ?? false,
        role,
      },
    }));
    setWorkersDirty(true);
  };

  const handleSave = async () => {
    try {
      // Build workers array from selections
      const workers: WorkerSpec[] = [];
      for (const [name, sel] of Object.entries(workerSelections)) {
        if (sel.selected) {
          // Find spec from available or from existing config
          const spec =
            availableWorkers.find((w) => w.name === name) ??
            (data.workers ?? []).find((w) => w.name === name);
          workers.push({
            name,
            description: spec?.description ?? "",
            system_prompt: spec?.system_prompt ?? null,
            tools: spec?.tools ?? null,
            disallowed_tools: spec?.disallowed_tools ?? null,
            skills: spec?.skills ?? null,
            model: spec?.model ?? "inherit",
            max_turns: spec?.max_turns ?? null,
            timeout_seconds: spec?.timeout_seconds ?? null,
            role: sel.role,
          });
        }
      }

      const payload: OrchestrationConfig = {
        mode,
        max_concurrency: pickNum(maxConcurrency, 3, { min: 1 }),
        workers,
      };
      await save(payload);
      toast.success("编排配置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const resetAll = () => {
    setMode(data.mode ?? "single");
    setMaxConcurrency(String(data.max_concurrency ?? 3));
    const configWorkers = data.workers ?? [];
    const initial: Record<string, { selected: boolean; role: string }> = {};
    for (const w of configWorkers) {
      initial[w.name] = { selected: true, role: w.role ?? "worker" };
    }
    setWorkerSelections(initial);
    setWorkersDirty(false);
  };

  const selectedCount = Object.values(workerSelections).filter((s) => s.selected).length;

  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
        多 Agent 编排
      </h3>
      <div className="divide-y overflow-hidden rounded-xl border">
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            加载中…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className={labelCls}>编排模式</p>
                <p className={descCls}>
                  single：lead agent + task_tool 委派（v1.0 行为）
                  <br />
                  multi：Orchestrator 图编排，支持并行批次与协作模式（v2.0）
                </p>
              </div>
              <div className="shrink-0">
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as "single" | "multi")}
                >
                  <SelectTrigger className="h-8 w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">single</SelectItem>
                    <SelectItem value="multi">multi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <NumberRow
              label="最大并发数"
              description="multi 模式下并行执行的子代理数量上限"
              value={maxConcurrency}
              onChange={setMaxConcurrency}
              placeholder="3"
            />

            {/* Worker selection */}
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className={labelCls}>编排 Workers</p>
                  <p className={descCls}>
                    从已创建的代理中选择参与者。切换到 multi 模式后至少需要一个 worker
                  </p>
                </div>
                {selectedCount > 0 && (
                  <Badge variant="secondary">
                    {selectedCount} / {Object.keys(workerSelections).length} 已选
                  </Badge>
                )}
              </div>

              {mode === "single" ? (
                <div className="text-muted-foreground rounded-lg bg-muted/30 px-3 py-4 text-center text-xs">
                  single 模式不需要 workers，子代理通过 task_tool 动态委派
                </div>
              ) : loadingWorkers ? (
                <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3 animate-spin" />
                  加载可用代理…
                </div>
              ) : Object.keys(workerSelections).length === 0 ? (
                <div className="text-muted-foreground rounded-lg bg-muted/30 px-3 py-4 text-center text-xs">
                  暂无可用代理。请先在「代理」设置页创建自定义代理
                </div>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(workerSelections)
                    .sort(([, a], [, b]) => Number(b.selected) - Number(a.selected))
                    .map(([name, sel]) => {
                      const spec = availableWorkers.find((w) => w.name === name);
                      return (
                        <div
                          key={name}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                            sel.selected && "border-primary/30 bg-primary/5",
                          )}
                        >
                          <Switch
                            checked={sel.selected}
                            onCheckedChange={() => toggleWorker(name)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <BotIcon className="text-muted-foreground size-3.5 shrink-0" />
                              <span className="text-sm font-medium">{name}</span>
                            </div>
                            {spec?.description && (
                              <p className="text-muted-foreground truncate text-xs">
                                {spec.description}
                              </p>
                            )}
                          </div>
                          {sel.selected && (
                            <Select
                              value={sel.role}
                              onValueChange={(v) => setWorkerRole(name, v)}
                            >
                              <SelectTrigger className="h-7 w-[110px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="worker">worker</SelectItem>
                                <SelectItem value="orchestrator">orchestrator</SelectItem>
                                <SelectItem value="reviewer">reviewer</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Show config-only workers (not in agents list) */}
              {(data.workers ?? []).filter(
                (w) => !availableWorkers.some((a) => a.name === w.name),
              ).length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <CheckCircle2Icon className="mr-1 inline size-3" />
                  另有 {(data.workers ?? []).filter((w) => !availableWorkers.some((a) => a.name === w.name)).length} 个手写配置的 worker（未对应已创建的代理）
                </div>
              )}
            </div>

            <div className="flex gap-2 px-4 py-3">
              <Button
                size="sm"
                disabled={!dirty || saving}
                onClick={handleSave}
              >
                {saving ? "保存中…" : "应用并重启"}
              </Button>
              {dirty && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetAll}
                  disabled={saving}
                >
                  重置
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ── reusable row ─────────────────────────────────────── */

function NumberRow({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className={labelCls}>{label}</p>
        <p className={descCls}>{description}</p>
      </div>
      <div className="shrink-0">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 w-28"
        />
      </div>
    </div>
  );
}
