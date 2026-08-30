"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { hintCls, labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

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
  const data = useMemo<ToolProgressConfig>(
    () => ({ ...defaultConfig, ...rawData }),
    [rawData],
  );
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);

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
        label="启用工具进度追踪"
        hint="检测工具调用的停滞与重复，在任务卡住时注入评估提示"
        checked={local.enabled}
        onCheckedChange={(v) => update("enabled", v)}
        disabled={saving}
      />

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

      <SettingSwitchRow
        label="注入评估提示"
        hint="将进度评估结果注入到模型请求中"
        checked={local.inject_assessment}
        onCheckedChange={(v) => update("inject_assessment", v)}
        disabled={saving}
      />

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
    </ConfigFormShell>
  );
}
