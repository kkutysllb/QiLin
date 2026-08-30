"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { hintCls, labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

interface ToolOutputConfig {
  enabled: boolean;
  externalize_min_chars: number;
  preview_head_chars: number;
  preview_tail_chars: number;
  fallback_max_chars: number;
  fallback_head_chars: number;
  fallback_tail_chars: number;
  storage_subdir: string;
}

const defaultConfig: ToolOutputConfig = {
  enabled: true,
  externalize_min_chars: 12000,
  preview_head_chars: 2000,
  preview_tail_chars: 1000,
  fallback_max_chars: 30000,
  fallback_head_chars: 8000,
  fallback_tail_chars: 3000,
  storage_subdir: ".tool-results",
};

export function ToolOutputForm() {
  const { data: rawData, loading, saving, save } =
    useConfigSection<ToolOutputConfig>("tool_output", defaultConfig);
  const data = useMemo<ToolOutputConfig>(
    () => ({ ...defaultConfig, ...rawData }),
    [rawData],
  );
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);

  const update = <K extends keyof ToolOutputConfig>(
    key: K,
    value: ToolOutputConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      await save(local);
      toast.success("工具输出预算配置已更新");
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
        label="启用工具输出预算"
        hint="超大工具结果将持久化到磁盘并替换为紧凑摘要，防止撑爆上下文窗口"
        checked={local.enabled}
        onCheckedChange={(v) => update("enabled", v)}
        disabled={saving}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>外化阈值（字符）</label>
          <Input
            type="number"
            min={0}
            value={local.externalize_min_chars}
            onChange={(e) =>
              update("externalize_min_chars", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>超过此长度的输出触发磁盘持久化，0 = 禁用</p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>存储子目录</label>
          <Input
            value={local.storage_subdir}
            onChange={(e) => update("storage_subdir", e.target.value)}
            disabled={saving}
          />
          <p className={hintCls}>持久化结果的线程输出子目录名</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>预览头部字符数</label>
          <Input
            type="number"
            min={0}
            value={local.preview_head_chars}
            onChange={(e) =>
              update("preview_head_chars", Number(e.target.value))
            }
            disabled={saving}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>预览尾部字符数</label>
          <Input
            type="number"
            min={0}
            value={local.preview_tail_chars}
            onChange={(e) =>
              update("preview_tail_chars", Number(e.target.value))
            }
            disabled={saving}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <label className={labelCls}>降级最大字符数</label>
          <Input
            type="number"
            min={0}
            value={local.fallback_max_chars}
            onChange={(e) =>
              update("fallback_max_chars", Number(e.target.value))
            }
            disabled={saving}
          />
          <p className={hintCls}>磁盘不可用时截断上限</p>
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>降级头部</label>
          <Input
            type="number"
            min={0}
            value={local.fallback_head_chars}
            onChange={(e) =>
              update("fallback_head_chars", Number(e.target.value))
            }
            disabled={saving}
          />
        </div>
        <div className="grid gap-1.5">
          <label className={labelCls}>降级尾部</label>
          <Input
            type="number"
            min={0}
            value={local.fallback_tail_chars}
            onChange={(e) =>
              update("fallback_tail_chars", Number(e.target.value))
            }
            disabled={saving}
          />
        </div>
      </div>
    </ConfigFormShell>
  );
}
