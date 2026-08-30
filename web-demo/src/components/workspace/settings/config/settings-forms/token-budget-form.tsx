"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { hintCls, labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

interface TokenBudgetConfig {
  enabled: boolean;
  max_tokens: number;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  warn_threshold: number;
  hard_stop_threshold: number;
}

const defaultConfig: TokenBudgetConfig = {
  enabled: false,
  max_tokens: 200000,
  max_input_tokens: null,
  max_output_tokens: null,
  warn_threshold: 0.8,
  hard_stop_threshold: 1.0,
};

export function TokenBudgetForm() {
  const { data: rawData, loading, saving, save } =
    useConfigSection<TokenBudgetConfig>("token_budget", defaultConfig);
  // Merge defaults so partial API data never leaves fields undefined.
  const data = useMemo<TokenBudgetConfig>(
    () => ({ ...defaultConfig, ...rawData }),
    [rawData],
  );
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);

  const update = <K extends keyof TokenBudgetConfig>(
    key: K,
    value: TokenBudgetConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    // Client-side validation mirroring the backend model_validator.
    if (local.hard_stop_threshold < local.warn_threshold) {
      toast.error("硬停止阈值不能低于软警告阈值");
      return;
    }
    try {
      await save(local);
      toast.success("Token 预算配置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const disabled = saving || !local.enabled;

  return (
    <ConfigFormShell
      loading={loading}
      saving={saving}
      dirty={dirty}
      onSave={handleSave}
      onReset={reset}
      bodyClassName="space-y-4"
    >
      {/* Enabled switch */}
      <SettingSwitchRow
        label="启用 Token 预算限制"
        hint="防止单次运行消耗过多 Token，超阈值时警告或强制结束"
        checked={local.enabled}
        onCheckedChange={(v) => update("enabled", v)}
        disabled={saving}
      />

      {/* Max tokens */}
      <div className="grid gap-1.5">
        <label className={labelCls}>总 Token 上限</label>
        <Input
          type="number"
          min={1000}
          value={local.max_tokens}
          onChange={(e) => update("max_tokens", Number(e.target.value))}
          disabled={disabled}
        />
        <p className={hintCls}>
          单次运行允许的最大总 Token 数（输入 + 输出），最小 1000
        </p>
      </div>

      {/* Max input / output tokens */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>输入 Token 上限</label>
          <Input
            type="number"
            min={1}
            value={local.max_input_tokens ?? ""}
            placeholder="留空 = 不单独限制"
            onChange={(e) =>
              update(
                "max_input_tokens",
                e.target.value ? Number(e.target.value) : null,
              )
            }
            disabled={disabled}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>输出 Token 上限</label>
          <Input
            type="number"
            min={1}
            value={local.max_output_tokens ?? ""}
            placeholder="留空 = 不单独限制"
            onChange={(e) =>
              update(
                "max_output_tokens",
                e.target.value ? Number(e.target.value) : null,
              )
            }
            disabled={disabled}
          />
        </div>
      </div>

      {/* Thresholds */}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>软警告阈值</label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={local.warn_threshold}
            onChange={(e) => update("warn_threshold", Number(e.target.value))}
            disabled={disabled}
          />
          <p className={hintCls}>
            达到预算的此比例时向智能体注入警告（如 0.8 = 80%）
          </p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>硬停止阈值</label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={local.hard_stop_threshold}
            onChange={(e) =>
              update("hard_stop_threshold", Number(e.target.value))
            }
            disabled={disabled}
          />
          <p className={hintCls}>
            达到此比例时剥离工具调用并强制输出最终答案（必须 ≥ 软警告）
          </p>
        </div>
      </div>
    </ConfigFormShell>
  );
}
