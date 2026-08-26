"use client";

import {
  ChevronDown,
  ChevronRight,
  Loader2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { cn } from "@/lib/utils";

import { useConfigSection } from "../use-config-section";

const labelCls = "text-sm font-medium leading-none";
const hintCls = "mt-0.5 text-xs text-muted-foreground";

interface MemoryBackendConfig {
  max_facts: number;
  fact_confidence_threshold: number;
  max_injection_tokens: number;
  debounce_seconds: number;
  token_counting: "tiktoken" | "char";
  staleness_review_enabled: boolean;
  staleness_age_days: number;
  guaranteed_categories: string[];
  consolidation_enabled: boolean;
}

interface MemoryConfig {
  enabled: boolean;
  mode: "middleware" | "tool";
  injection_enabled: boolean;
  shutdown_flush_timeout_seconds: number;
  manager_class: string;
  backend_config: MemoryBackendConfig;
}

const defaultBackendConfig: MemoryBackendConfig = {
  max_facts: 100,
  fact_confidence_threshold: 0.7,
  max_injection_tokens: 2000,
  debounce_seconds: 30,
  token_counting: "tiktoken",
  staleness_review_enabled: true,
  staleness_age_days: 90,
  guaranteed_categories: ["correction"],
  consolidation_enabled: false,
};

const defaultConfig: MemoryConfig = {
  enabled: true,
  mode: "middleware",
  injection_enabled: true,
  shutdown_flush_timeout_seconds: 30,
  manager_class: "qilinmem",
  backend_config: defaultBackendConfig,
};

/** Merge backend-provided backend_config over defaults so missing keys are filled. */
function mergeBackendConfig(
  raw: Partial<MemoryBackendConfig> | undefined,
): MemoryBackendConfig {
  return { ...defaultBackendConfig, ...raw };
}

export function MemoryForm() {
  const { data: rawData, loading, saving, save } = useConfigSection<MemoryConfig>(
    "memory",
    defaultConfig,
  );
  // Merge defaults first so partial API responses never leave fields
  // undefined (which would flip inputs from controlled to uncontrolled).
  const data: MemoryConfig = {
    ...defaultConfig,
    ...rawData,
    backend_config: mergeBackendConfig(rawData?.backend_config),
  };
  const [local, setLocal] = useState<MemoryConfig>(data);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    setLocal({
      ...defaultConfig,
      ...rawData,
      backend_config: mergeBackendConfig(rawData?.backend_config),
    });
  }, [rawData]);

  const dirty = JSON.stringify(local) !== JSON.stringify(data);

  const update = <K extends keyof MemoryConfig>(
    key: K,
    value: MemoryConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const updateBackend = <K extends keyof MemoryBackendConfig>(
    key: K,
    value: MemoryBackendConfig[K],
  ) =>
    setLocal((prev) => ({
      ...prev,
      backend_config: { ...prev.backend_config, [key]: value },
    }));

  const handleSave = async () => {
    // Clamp values to backend pydantic constraints to avoid 422 errors.
    const clamped: MemoryConfig = {
      ...local,
      backend_config: {
        ...local.backend_config,
        max_injection_tokens: Math.min(
          Math.max(local.backend_config.max_injection_tokens, 100),
          8000,
        ),
      },
    };
    try {
      await save(clamped);
      toast.success("记忆配置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        加载中…
      </div>
    );
  }

  const disabled = saving || !local.enabled;

  return (
    <div className="space-y-4">
      {/* Switches */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
        <div>
          <p className={labelCls}>启用记忆系统</p>
          <p className={hintCls}>关闭后智能体不会自动提取或存储记忆</p>
        </div>
        <Switch
          checked={local.enabled}
          onCheckedChange={(v) => update("enabled", v)}
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
        <div>
          <p className={labelCls}>启用记忆注入</p>
          <p className={hintCls}>将相关记忆自动注入对话上下文</p>
        </div>
        <Switch
          checked={local.injection_enabled}
          onCheckedChange={(v) => update("injection_enabled", v)}
          disabled={disabled}
        />
      </div>

      {/* Mode select */}
      <div className="grid gap-1.5">
        <label className={labelCls}>运行模式</label>
        <Select
          value={local.mode}
          onValueChange={(v) => update("mode", v as MemoryConfig["mode"])}
          disabled={disabled}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="middleware">
              middleware（后台自动提取）
            </SelectItem>
            <SelectItem value="tool">
              tool（模型主动调用记忆工具）
            </SelectItem>
          </SelectContent>
        </Select>
        <p className={hintCls}>
          middleware 模式在每轮对话后被动提取记忆；tool 模式让模型自行决定何时读写记忆
        </p>
      </div>

      {/* Backend selector */}
      <div className="grid gap-1.5">
        <label className={labelCls}>记忆后端</label>
        <Select
          value={local.manager_class}
          onValueChange={(v) => update("manager_class", v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="qilinmem">qilinmem（本地文件存储）</SelectItem>
            <SelectItem value="noop">noop（禁用持久化）</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Numeric fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>关闭刷新超时（秒）</label>
          <Input
            type="number"
            min={1}
            max={300}
            value={local.shutdown_flush_timeout_seconds}
            onChange={(e) =>
              update(
                "shutdown_flush_timeout_seconds",
                Number(e.target.value),
              )
            }
            disabled={disabled}
          />
          <p className={hintCls}>Gateway 关闭时等待记忆刷盘的最大时间</p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>最大事实数</label>
          <Input
            type="number"
            min={1}
            value={local.backend_config.max_facts}
            onChange={(e) =>
              updateBackend("max_facts", Number(e.target.value))
            }
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>置信度阈值</label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={local.backend_config.fact_confidence_threshold}
            onChange={(e) =>
              updateBackend(
                "fact_confidence_threshold",
                Number(e.target.value),
              )
            }
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>注入 Token 上限</label>
          <Input
            type="number"
            min={100}
            max={8000}
            value={local.backend_config.max_injection_tokens}
            onChange={(e) =>
              updateBackend("max_injection_tokens", Number(e.target.value))
            }
            disabled={disabled || !local.injection_enabled}
          />
          <p className={hintCls}>后端限制 100–8000</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>写入防抖（秒）</label>
          <Input
            type="number"
            min={1}
            value={local.backend_config.debounce_seconds}
            onChange={(e) =>
              updateBackend("debounce_seconds", Number(e.target.value))
            }
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>Token 计数方式</label>
          <Select
            value={local.backend_config.token_counting}
            onValueChange={(v) =>
              updateBackend(
                "token_counting",
                v as MemoryBackendConfig["token_counting"],
              )
            }
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tiktoken">tiktoken（精确，首次需联网）</SelectItem>
              <SelectItem value="char">char（免联网，CJK 友好）</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced section */}
      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="flex w-full items-center gap-1 pt-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {advancedOpen ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        高级设置
      </button>

      <div className={cn("space-y-3", !advancedOpen && "hidden")}>
        <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
          <div>
            <p className={labelCls}>过期审查</p>
            <p className={hintCls}>
              定期审查并清理可能已过时的记忆事实
            </p>
          </div>
          <Switch
            checked={local.backend_config.staleness_review_enabled}
            onCheckedChange={(v) =>
              updateBackend("staleness_review_enabled", v)
            }
            disabled={disabled}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label className={labelCls}>过期阈值（天）</label>
            <Input
              type="number"
              min={1}
              value={local.backend_config.staleness_age_days}
              onChange={(e) =>
                updateBackend("staleness_age_days", Number(e.target.value))
              }
              disabled={disabled || !local.backend_config.staleness_review_enabled}
            />
          </div>
          <div className="grid gap-1.5">
            <label className={labelCls}>保证注入类别</label>
            <Input
              value={local.backend_config.guaranteed_categories.join(", ")}
              onChange={(e) =>
                updateBackend(
                  "guaranteed_categories",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              disabled={disabled}
            />
            <p className={hintCls}>逗号分隔，如 correction, preference</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
          <div>
            <p className={labelCls}>记忆合并</p>
            <p className={hintCls}>
              将多条相似事实合并为一条（有损操作，源事实会被替换）
            </p>
          </div>
          <Switch
            checked={local.backend_config.consolidation_enabled}
            onCheckedChange={(v) =>
              updateBackend("consolidation_enabled", v)
            }
            disabled={disabled}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          {saving ? "保存中…" : "保存"}
        </Button>
        {dirty && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLocal(data)}
            disabled={saving}
          >
            重置
          </Button>
        )}
      </div>
    </div>
  );
}
