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
  const data: TitleConfig = { ...defaultConfig, ...rawData };
  const [local, setLocal] = useState<TitleConfig>(data);

  useEffect(() => {
    setLocal({ ...defaultConfig, ...rawData });
  }, [rawData]);

  const dirty = JSON.stringify(local) !== JSON.stringify(data);

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
          <p className={labelCls}>启用标题生成</p>
          <p className={hintCls}>
            关闭后新对话将使用默认标题（如「新对话」）
          </p>
        </div>
        <Switch
          checked={local.enabled}
          onCheckedChange={(v) => update("enabled", v)}
          disabled={saving}
        />
      </div>

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
