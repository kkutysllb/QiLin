"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ConfigFormShell } from "../config-form-shell";
import { labelCls } from "../form-styles";
import { useConfigSection } from "../use-config-section";

export function LogLevelForm() {
  const { data, loading, saving, save } = useConfigSection<string>(
    "log_level",
    "info",
  );
  const [value, setValue] = useState(data);

  // Sync external data into local state when loaded. 渲染期 setState 写法
  //（仅加载中覆盖草稿），与其余 useEffect 同步式表单语义不同，保持原样。
  if (loading && value !== data) {
    setValue(data);
  }

  const dirty = value !== data;

  const handleSave = async () => {
    try {
      await save(value);
      toast.success("日志级别已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  return (
    <ConfigFormShell
      title="日志级别"
      description="控制 QiLin 模块的日志输出详细程度"
      loading={loading}
      saving={saving}
      dirty={dirty}
      onSave={handleSave}
      onReset={() => setValue(data)}
      actionsClassName="flex gap-2 pt-2"
    >
      <div className="grid gap-2">
        <label className={labelCls}>日志级别</label>
        <Select
          value={String(value)}
          onValueChange={(v) => setValue(v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="debug">debug</SelectItem>
            <SelectItem value="info">info</SelectItem>
            <SelectItem value="warning">warning</SelectItem>
            <SelectItem value="error">error</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          debug 输出最详细，error 仅输出错误信息
        </p>
      </div>
    </ConfigFormShell>
  );
}
