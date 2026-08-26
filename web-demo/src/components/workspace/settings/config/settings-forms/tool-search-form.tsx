"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { useConfigSection } from "../use-config-section";

const labelCls = "text-sm font-medium leading-none";
const hintCls = "mt-0.5 text-xs text-muted-foreground";

interface ToolSearchConfig {
  enabled: boolean;
  auto_promote_top_k: number;
}

const defaultConfig: ToolSearchConfig = {
  enabled: false,
  auto_promote_top_k: 3,
};

export function ToolSearchForm() {
  const { data: rawData, loading, saving, save } =
    useConfigSection<ToolSearchConfig>("tool_search", defaultConfig);
  const data: ToolSearchConfig = { ...defaultConfig, ...rawData };
  const [local, setLocal] = useState<ToolSearchConfig>(data);

  useEffect(() => {
    setLocal({ ...defaultConfig, ...rawData });
  }, [rawData]);

  const dirty = JSON.stringify(local) !== JSON.stringify(data);

  const update = <K extends keyof ToolSearchConfig>(
    key: K,
    value: ToolSearchConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    // Clamp to 1-5 (mirrors backend field_validator).
    const clamped: ToolSearchConfig = {
      ...local,
      auto_promote_top_k: Math.min(Math.max(local.auto_promote_top_k, 1), 5),
    };
    try {
      await save(clamped);
      toast.success("工具搜索配置已更新");
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
        <div>
          <p className={labelCls}>启用延迟加载</p>
          <p className={hintCls}>
            MCP 工具不再预加载到上下文，改为运行时通过 tool_search 发现
          </p>
        </div>
        <Switch
          checked={local.enabled}
          onCheckedChange={(v) => update("enabled", v)}
          disabled={saving}
        />
      </div>

      <div className="grid gap-1.5">
        <label className={labelCls}>自动提升数量 (auto_promote_top_k)</label>
        <Input
          type="number"
          min={1}
          max={5}
          value={local.auto_promote_top_k}
          onChange={(e) =>
            update("auto_promote_top_k", Number(e.target.value))
          }
          disabled={saving}
        />
        <p className={hintCls}>
          每次模型调用自动从路由元数据中提升的延迟 MCP 工具 schema 最大数（范围 1–5）
        </p>
      </div>

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
