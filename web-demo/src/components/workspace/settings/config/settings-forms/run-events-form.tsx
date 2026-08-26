"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { useConfigSection } from "../use-config-section";

const labelCls = "text-sm font-medium leading-none";
const hintCls = "mt-0.5 text-xs text-muted-foreground";

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
  const [local, setLocal] = useState<RunEventsConfig>(data);

  useEffect(() => {
    setLocal(data);
  }, [data]);

  const dirty = JSON.stringify(local) !== JSON.stringify(data);

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

      <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
        <div>
          <p className={labelCls}>记录 Token 用量</p>
          <p className={hintCls}>
            在运行 trace 中记录每次模型调用的 token 消耗
          </p>
        </div>
        <Switch
          checked={local.track_token_usage}
          onCheckedChange={(v) => update("track_token_usage", v)}
          disabled={saving}
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
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
