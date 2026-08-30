"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

interface CronConfig {
  enabled: boolean;
}

export function CronForm() {
  const { data, loading, saving, save } = useConfigSection<CronConfig>(
    "scheduler",
    { enabled: false },
  );
  // 原实现以 data.enabled 为同步/比较粒度；包装成 memo 对象保持同一语义
  //（仅当 data.enabled 变化时才覆盖未保存草稿）。
  const draftData = useMemo(() => ({ enabled: data.enabled }), [data.enabled]);
  const { draft: local, setDraft: setLocal, dirty, reset } =
    useLocalDraft(draftData);

  const handleSave = async () => {
    try {
      await save({ enabled: local.enabled });
      toast.success("自动化设置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <ConfigFormShell
      title="自动化调度器 (Scheduler)"
      description="启用后台调度器后，自动化任务将按计划自动触发执行"
      loading={loading}
      saving={saving}
      dirty={dirty}
      onSave={handleSave}
      onReset={reset}
    >
      <SettingSwitchRow
        label="启用自动化调度器"
        hint="关闭后所有自动化任务将停止执行"
        checked={local.enabled}
        onCheckedChange={(v) => setLocal({ enabled: v })}
        disabled={saving}
      />
    </ConfigFormShell>
  );
}
