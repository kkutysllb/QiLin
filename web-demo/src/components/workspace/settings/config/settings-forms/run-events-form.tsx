"use client";

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

interface RunEventsConfig {
  backend: "memory" | "db" | "jsonl";
  max_trace_content: number;
  track_token_usage: boolean;
}

const defaultConfig: RunEventsConfig = {
  backend: "memory",
  max_trace_content: 10240,
  track_token_usage: true,
};

export function RunEventsForm() {
  const { data, loading, saving, save } = useConfigSection<RunEventsConfig>(
    "run_events",
    defaultConfig,
  );
  const { draft: local, setDraft: setLocal, dirty, reset } = useLocalDraft(data);

  const update = <K extends keyof RunEventsConfig>(
    key: K,
    value: RunEventsConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      await save(local);
      toast.success("运行事件配置已更新");
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
      <div className="grid gap-2">
        <label className={labelCls}>存储后端</label>
        <Select
          value={local.backend}
          onValueChange={(v) => update("backend", v as RunEventsConfig["backend"])}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="memory">内存（重启丢失）</SelectItem>
            <SelectItem value="db">数据库 (db)</SelectItem>
            <SelectItem value="jsonl">JSONL 文件</SelectItem>
          </SelectContent>
        </Select>
        {local.backend === "memory" ? (
          <p className={hintCls}>
            运行事件未持久化，重启后历史 trace 将丢失。建议改为 db 或 jsonl。
          </p>
        ) : (
          <p className={hintCls}>
            {local.backend === "db"
              ? "trace 写入数据库 run_events 表，支持查询"
              : "trace 追写到 JSONL 文件，适合归档与离线分析"}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <label className={labelCls}>Trace 内容最大长度</label>
        <Input
          type="number"
          value={local.max_trace_content}
          onChange={(e) => update("max_trace_content", Number(e.target.value))}
          disabled={saving}
          className="w-40 font-mono text-sm"
        />
        <p className={hintCls}>
          单条 trace 内容超过此长度将被截断（默认 10240 字符）
        </p>
      </div>

      <SettingSwitchRow
        label="记录 Token 用量"
        hint="在运行 trace 中记录每次模型调用的 token 消耗"
        checked={local.track_token_usage}
        onCheckedChange={(v) => update("track_token_usage", v)}
        disabled={saving}
      />
    </ConfigFormShell>
  );
}
