"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { ConfigFormShell, SettingSwitchRow } from "../config-form-shell";
import { useConfigSection } from "../use-config-section";
import { useLocalDraft } from "../use-local-draft";

interface TokenUsageConfig {
  enabled: boolean;
}

export function TokenUsageForm() {
  const { data, loading, saving, save } = useConfigSection<TokenUsageConfig>(
    "token_usage",
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
      toast.success("Token 使用设置已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <ConfigFormShell
      title="Token 使用统计"
      description="记录每次模型调用的 token 消耗并在界面中展示"
      loading={loading}
      saving={saving}
      dirty={dirty}
      onSave={handleSave}
      onReset={reset}
    >
      <SettingSwitchRow
        label="启用 Token 使用统计"
        hint="启用后将在对话中显示输入/输出 token 数量"
        checked={local.enabled}
        onCheckedChange={(v) => setLocal({ enabled: v })}
        disabled={saving}
      />
    </ConfigFormShell>
  );
}
