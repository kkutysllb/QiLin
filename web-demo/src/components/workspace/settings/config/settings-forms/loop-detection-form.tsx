"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { hintCls, labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

interface LoopDetectionConfig {
  enabled: boolean;
  warn_threshold: number;
  hard_limit: number;
  window_size: number;
  max_tracked_threads: number;
  tool_freq_warn: number;
  tool_freq_hard_limit: number;
}

const defaultConfig: LoopDetectionConfig = {
  enabled: true,
  warn_threshold: 3,
  hard_limit: 5,
  window_size: 20,
  max_tracked_threads: 100,
  tool_freq_warn: 30,
  tool_freq_hard_limit: 50,
};

export function LoopDetectionForm() {
  const { data: rawData, loading, saving, save } =
    useConfigSection<LoopDetectionConfig>("loop_detection", defaultConfig);
  const data = useMemo<LoopDetectionConfig>(
    () => ({ ...defaultConfig, ...rawData }),
    [rawData],
  );
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);

  const update = <K extends keyof LoopDetectionConfig>(
    key: K,
    value: LoopDetectionConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    // Client-side validation mirroring backend model_validator.
    if (local.hard_limit < local.warn_threshold) {
      toast.error("硬限制不能低于软警告阈值");
      return;
    }
    if (local.tool_freq_hard_limit < local.tool_freq_warn) {
      toast.error("工具频率硬限制不能低于软警告阈值");
      return;
    }
    try {
      await save(local);
      toast.success("循环检测配置已更新");
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
        label="启用循环检测"
        hint="检测并中断重复的相同工具调用循环，防止智能体陷入死循环"
        checked={local.enabled}
        onCheckedChange={(v) => update("enabled", v)}
        disabled={saving}
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>警告阈值</label>
          <Input
            type="number"
            min={1}
            value={local.warn_threshold}
            onChange={(e) =>
              update("warn_threshold", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>相同工具调用集出现此次数后注入警告</p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>硬限制</label>
          <Input
            type="number"
            min={1}
            value={local.hard_limit}
            onChange={(e) =>
              update("hard_limit", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>此次数后强制停止（≥ 警告阈值）</p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>窗口大小</label>
          <Input
            type="number"
            min={1}
            value={local.window_size}
            onChange={(e) =>
              update("window_size", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>每线程追踪的最近工具调用集数</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>工具频率警告</label>
          <Input
            type="number"
            min={1}
            value={local.tool_freq_warn}
            onChange={(e) =>
              update("tool_freq_warn", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>同一工具调用此次数后注入频率警告</p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>工具频率硬限制</label>
          <Input
            type="number"
            min={1}
            value={local.tool_freq_hard_limit}
            onChange={(e) =>
              update("tool_freq_hard_limit", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>此次数后强制停止（≥ 软警告）</p>
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
        </div>
      </div>
    </ConfigFormShell>
  );
}
