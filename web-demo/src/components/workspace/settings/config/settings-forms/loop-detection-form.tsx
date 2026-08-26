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
  const data: LoopDetectionConfig = { ...defaultConfig, ...rawData };
  const [local, setLocal] = useState<LoopDetectionConfig>(data);

  useEffect(() => {
    setLocal({ ...defaultConfig, ...rawData });
  }, [rawData]);

  const dirty = JSON.stringify(local) !== JSON.stringify(data);

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
          <p className={labelCls}>启用循环检测</p>
          <p className={hintCls}>
            检测并中断重复的相同工具调用循环，防止智能体陷入死循环
          </p>
        </div>
        <Switch
          checked={local.enabled}
          onCheckedChange={(v) => update("enabled", v)}
          disabled={saving}
        />
      </div>

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
