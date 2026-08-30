"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { hintCls, labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

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
  const data = useMemo<ToolSearchConfig>(
    () => ({ ...defaultConfig, ...rawData }),
    [rawData],
  );
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);

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

  return (
    <ConfigFormShell
      loading={loading}
      saving={saving}
      dirty={dirty}
      onSave={handleSave}
      onReset={reset}
      bodyClassName="space-y-4"
    >
      <SettingSwitchRow
        label="启用延迟加载"
        hint="MCP 工具不再预加载到上下文，改为运行时通过 tool_search 发现"
        checked={local.enabled}
        onCheckedChange={(v) => update("enabled", v)}
        disabled={saving}
      />

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
    </ConfigFormShell>
  );
}
