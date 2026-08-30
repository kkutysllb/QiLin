"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { hintCls, labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

type ContextSizeType = "fraction" | "tokens" | "messages";

interface ContextSize {
  type: ContextSizeType;
  value: number;
}

interface SummarizationConfig {
  enabled: boolean;
  model_name: string | null;
  trigger: ContextSize | null;
  keep: ContextSize;
  trim_tokens_to_summarize: number | null;
}

const defaultConfig: SummarizationConfig = {
  enabled: false,
  model_name: null,
  trigger: { type: "tokens", value: 32000 },
  keep: { type: "messages", value: 20 },
  trim_tokens_to_summarize: 4000,
};

/** Merge defaults over partial API data so no field is ever undefined. */
function normalizeConfig(raw: Partial<SummarizationConfig> | undefined): SummarizationConfig {
  return {
    ...defaultConfig,
    ...raw,
    trigger: raw?.trigger ?? defaultConfig.trigger,
    keep: raw?.keep ?? defaultConfig.keep,
  };
}

export function SummarizationForm() {
  const { data: rawData, loading, saving, save } =
    useConfigSection<SummarizationConfig>("summarization", defaultConfig);
  const data = useMemo(() => normalizeConfig(rawData), [rawData]);
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);

  const update = <K extends keyof SummarizationConfig>(
    key: K,
    value: SummarizationConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const updateTrigger = (patch: Partial<ContextSize>) =>
    setLocal((prev) => ({
      ...prev,
      trigger: prev.trigger ? { ...prev.trigger, ...patch } : { ...patch } as ContextSize,
    }));

  const updateKeep = (patch: Partial<ContextSize>) =>
    setLocal((prev) => ({
      ...prev,
      keep: { ...prev.keep, ...patch },
    }));

  const handleSave = async () => {
    try {
      await save(local);
      toast.success("摘要配置已更新");
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
      <SettingSwitchRow
        label="启用对话摘要"
        hint="当上下文接近模型限制时自动压缩历史对话，保留近期内容"
        checked={local.enabled}
        onCheckedChange={(v) => update("enabled", v)}
        disabled={saving}
      />

      {/* Model name */}
      <div className="grid gap-1.5">
        <label className={labelCls}>摘要模型</label>
        <Input
          value={local.model_name ?? ""}
          placeholder="留空 = 跟随当前对话模型"
          onChange={(e) =>
            update("model_name", e.target.value.trim() || null)
          }
          disabled={disabled}
        />
        <p className={hintCls}>
          指定一个轻量模型（如 gpt-4o-mini）可降低摘要成本；留空则使用当前对话的模型
        </p>
      </div>

      {/* Trigger */}
      <div className="space-y-2">
        <p className={labelCls}>触发条件</p>
        <p className={hintCls}>满足任一条件时触发摘要压缩</p>
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={local.trigger?.type ?? "tokens"}
            onValueChange={(v) =>
              updateTrigger({ type: v as ContextSizeType })
            }
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tokens">按 Token 数</SelectItem>
              <SelectItem value="messages">按消息条数</SelectItem>
              <SelectItem value="fraction">按上下文占比</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step={local.trigger?.type === "fraction" ? 0.05 : 1}
            max={local.trigger?.type === "fraction" ? 1 : undefined}
            value={local.trigger?.value ?? 0}
            onChange={(e) =>
              updateTrigger({ value: Number(e.target.value) })
            }
            disabled={disabled}
          />
        </div>
      </div>

      {/* Keep */}
      <div className="space-y-2">
        <p className={labelCls}>保留策略</p>
        <p className={hintCls}>摘要后保留多少近期上下文</p>
        <div className="grid grid-cols-2 gap-3">
          <Select
            value={local.keep.type}
            onValueChange={(v) =>
              updateKeep({ type: v as ContextSizeType })
            }
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="messages">按消息条数</SelectItem>
              <SelectItem value="tokens">按 Token 数</SelectItem>
              <SelectItem value="fraction">按上下文占比</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            step={local.keep.type === "fraction" ? 0.05 : 1}
            max={local.keep.type === "fraction" ? 1 : undefined}
            value={local.keep.value}
            onChange={(e) =>
              updateKeep({ value: Number(e.target.value) })
            }
            disabled={disabled}
          />
        </div>
      </div>

      {/* Trim tokens */}
      <div className="grid gap-1.5">
        <label className={labelCls}>摘要前裁剪 Token 上限</label>
        <Input
          type="number"
          min={0}
          value={local.trim_tokens_to_summarize ?? 0}
          onChange={(e) =>
            update(
              "trim_tokens_to_summarize",
              e.target.value ? Number(e.target.value) : null,
            )
          }
          disabled={disabled}
        />
        <p className={hintCls}>
          准备摘要消息时的最大 Token 数；设为 0 或 null 跳过裁剪
        </p>
      </div>
    </ConfigFormShell>
  );
}
