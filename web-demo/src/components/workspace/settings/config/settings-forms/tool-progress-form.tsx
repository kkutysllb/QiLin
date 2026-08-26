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

interface ToolProgressConfig {
  enabled: boolean;
  stagnation_threshold: number;
  warn_escalation_count: number;
  inject_assessment: boolean;
  jaccard_similarity_threshold: number;
  min_word_count_for_similarity: number;
  max_tracked_threads: number;
}

const defaultConfig: ToolProgressConfig = {
  enabled: false,
  stagnation_threshold: 3,
  warn_escalation_count: 2,
  inject_assessment: true,
  jaccard_similarity_threshold: 0.8,
  min_word_count_for_similarity: 10,
  max_tracked_threads: 100,
};

export function ToolProgressForm() {
  const { data: rawData, loading, saving, save } =
    useConfigSection<ToolProgressConfig>("tool_progress", defaultConfig);
  const data: ToolProgressConfig = { ...defaultConfig, ...rawData };
  const [local, setLocal] = useState<ToolProgressConfig>(data);

  useEffect(() => {
    setLocal({ ...defaultConfig, ...rawData });
  }, [rawData]);

  const dirty = JSON.stringify(local) !== JSON.stringify(data);

  const update = <K extends keyof ToolProgressConfig>(
    key: K,
    value: ToolProgressConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      await save(local);
      toast.success("工具进度追踪配置已更新");
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
          <p className={labelCls}>启用工具进度追踪</p>
          <p className={hintCls}>
            检测工具调用的停滞与重复，在任务卡住时注入评估提示
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
          <label className={labelCls}>停滞阈值</label>
          <Input
            type="number"
            min={1}
            value={local.stagnation_threshold}
            onChange={(e) =>
              update("stagnation_threshold", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>连续无新信息调用次数后注入警告</p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>升级次数</label>
          <Input
            type="number"
            min={1}
            value={local.warn_escalation_count}
            onChange={(e) =>
              update("warn_escalation_count", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>警告后再出现此次数的问题后升级为 BLOCKED</p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
        <div>
          <p className={labelCls}>注入评估提示</p>
          <p className={hintCls}>将进度评估结果注入到模型请求中</p>
        </div>
        <Switch
          checked={local.inject_assessment}
          onCheckedChange={(v) => update("inject_assessment", v)}
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>Jaccard 相似度阈值</label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={local.jaccard_similarity_threshold}
            onChange={(e) =>
              update("jaccard_similarity_threshold", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>近重复检测的词集相似度阈值</p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>最小词数</label>
          <Input
            type="number"
            min={0}
            value={local.min_word_count_for_similarity}
            onChange={(e) =>
              update("min_word_count_for_similarity", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>低于此词数跳过 Jaccard 检查</p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>最大追踪线程数</label>
          <Input
            type="number"
            min={1}
            value={local.max_tracked_threads}
            onChange={(e) =>
              update("max_tracked_threads", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>内存中保留的线程历史上限（LRU）</p>
        </div>
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
