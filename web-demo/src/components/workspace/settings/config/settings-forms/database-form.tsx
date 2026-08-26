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

import { useConfigSection } from "../use-config-section";

const labelCls = "text-sm font-medium leading-none";
const hintCls = "mt-0.5 text-xs text-muted-foreground";
const restartBadge = (
  <span
    title="修改后需重启后端生效"
    className="ml-1 text-xs text-amber-600 dark:text-amber-400"
  >
    ⟳ 重启
  </span>
);
const hotReloadBadge = (
  <span
    title="修改后热重载生效，无需重启"
    className="ml-1 text-xs text-emerald-600 dark:text-emerald-400"
  >
    ⚡ 热重载
  </span>
);

interface DatabaseConfig {
  backend: "memory" | "sqlite" | "postgres";
  sqlite_dir: string;
  postgres_url: string;
  checkpoint_channel_mode: "full" | "delta";
  pool_size: number;
  pool_recycle: number;
  command_timeout: number;
}

const defaultConfig: DatabaseConfig = {
  backend: "memory",
  sqlite_dir: ".qilin/data",
  postgres_url: "",
  checkpoint_channel_mode: "full",
  pool_size: 5,
  pool_recycle: 300,
  command_timeout: 30,
};

export function DatabaseForm() {
  const { data, loading, saving, save } = useConfigSection<DatabaseConfig>(
    "database",
    defaultConfig,
  );
  const [local, setLocal] = useState<DatabaseConfig>(data);

  useEffect(() => {
    setLocal(data);
  }, [data]);

  const dirty = JSON.stringify(local) !== JSON.stringify(data);

  const update = <K extends keyof DatabaseConfig>(
    key: K,
    value: DatabaseConfig[K],
  ) => setLocal((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      await save(local);
      toast.success("数据库配置已更新");
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
        <label className={labelCls}>
          数据库后端{restartBadge}
        </label>
        <Select
          value={local.backend}
          onValueChange={(v) => update("backend", v as DatabaseConfig["backend"])}
        >
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="memory">内存（不持久化）</SelectItem>
            <SelectItem value="sqlite">SQLite</SelectItem>
            <SelectItem value="postgres">PostgreSQL</SelectItem>
          </SelectContent>
        </Select>
        <p className={hintCls}>
          memory 不落盘（重启丢失）；sqlite 适合桌面单节点；postgres 适合多节点部署
        </p>
      </div>

      {local.backend === "sqlite" && (
        <div className="grid gap-2">
          <label className={labelCls}>
            SQLite 数据目录{restartBadge}
          </label>
          <Input
            value={local.sqlite_dir}
            onChange={(e) => update("sqlite_dir", e.target.value)}
            disabled={saving}
            className="w-72 font-mono text-sm"
          />
          <p className={hintCls}>qilin.db 文件所在目录（绝对或相对路径）</p>
        </div>
      )}

      {local.backend === "postgres" && (
        <>
          <div className="grid gap-2">
            <label className={labelCls}>
              PostgreSQL 连接 URL{restartBadge}
            </label>
            <Input
              value={local.postgres_url}
              onChange={(e) => update("postgres_url", e.target.value)}
              disabled={saving}
              className="font-mono text-sm"
              placeholder="postgresql://user:password@host:5432/dbname"
            />
            <p className={hintCls}>
              含密码的完整连接串。保存后后端会以 $ENV 引用写入 .env，不再明文回显
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <label className={labelCls}>
                连接池大小{hotReloadBadge}
              </label>
              <Input
                type="number"
                value={local.pool_size}
                onChange={(e) => update("pool_size", Number(e.target.value))}
                disabled={saving}
                className="font-mono text-sm"
              />
            </div>
            <div className="grid gap-2">
              <label className={labelCls}>
                连接回收秒数{hotReloadBadge}
              </label>
              <Input
                type="number"
                value={local.pool_recycle}
                onChange={(e) => update("pool_recycle", Number(e.target.value))}
                disabled={saving}
                className="font-mono text-sm"
              />
            </div>
            <div className="grid gap-2">
              <label className={labelCls}>
                命令超时秒{hotReloadBadge}
              </label>
              <Input
                type="number"
                value={local.command_timeout}
                onChange={(e) => update("command_timeout", Number(e.target.value))}
                disabled={saving}
                className="font-mono text-sm"
              />
            </div>
          </div>
        </>
      )}

      <div className="grid gap-2">
        <label className={labelCls}>
          Checkpoint 通道模式{restartBadge}
        </label>
        <Select
          value={local.checkpoint_channel_mode}
          onValueChange={(v) =>
            update("checkpoint_channel_mode", v as DatabaseConfig["checkpoint_channel_mode"])
          }
        >
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full">full（完整消息快照）</SelectItem>
            <SelectItem value="delta">delta（增量通道）</SelectItem>
          </SelectContent>
        </Select>
        <p className={hintCls}>
          full 存储完整消息历史，delta 仅存增量（更省空间但需 DeltaChannel 支持）
        </p>
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
