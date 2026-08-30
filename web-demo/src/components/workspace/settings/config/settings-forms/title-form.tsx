"use client";

import { Loader2Icon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { hintCls, labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

interface TitleConfig {
  enabled: boolean;
  max_words: number;
  max_chars: number;
  model_name: string | null;
}

const defaultConfig: TitleConfig = {
  enabled: true,
  max_words: 6,
  max_chars: 60,
  model_name: null,
};

export function TitleForm() {
  const { data: rawData, loading, saving, save } = useConfigSection<TitleConfig>(
    "title",
    defaultConfig,
  );
  // Merge defaults over partial API data so no field is ever undefined.
  const data = useMemo<TitleConfig>(
    () => ({ ...defaultConfig, ...rawData }),
    [rawData],
  );
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);

  const update = <K extends keyof TitleConfig>(
    key: K,
    value: TitleConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      await save(local);
      toast.success("标题生成配置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  // 整段早退式加载块保持内联（与其他表单的共享壳三元渲染语义等价）。
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        加载中…
      </div>
    );
  }

  return (
    <ConfigFormShell
      saving={saving}
      dirty={dirty}
      onSave={handleSave}
      onReset={reset}
      bodyClassName="space-y-4"
    >
      <SettingSwitchRow
        label="启用标题生成"
        hint="关闭后新对话将使用默认标题（如「新对话」）"
        checked={local.enabled}
        onCheckedChange={(v) => update("enabled", v)}
        disabled={saving}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>最大词数</label>
          <Input
            type="number"
            min={1}
            max={20}
            value={local.max_words}
            onChange={(e) => update("max_words", Number(e.target.value))}
            disabled={saving || !local.enabled}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>最大字符数</label>
          <Input
            type="number"
            min={10}
            max={200}
            value={local.max_chars}
            onChange={(e) => update("max_chars", Number(e.target.value))}
            disabled={saving || !local.enabled}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <label className={labelCls}>标题生成模型</label>
        <Input
          value={local.model_name ?? ""}
          placeholder="留空 = 使用本地回退标题"
          onChange={(e) =>
            update("model_name", e.target.value.trim() || null)
          }
          disabled={saving || !local.enabled}
        />
        <p className={hintCls}>
          指定模型名称以启用 LLM 标题生成；留空则使用本地启发式回退
        </p>
      </div>
    </ConfigFormShell>
  );
}
