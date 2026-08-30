"use client";

import { Loader2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { hintCls, labelCls } from "./form-styles";

/**
 * 「加载中…」spinner 块（原 18 处重复的 loading 块）。
 */
export function ConfigFormLoading() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" />
      加载中…
    </div>
  );
}

interface ConfigFormShellProps {
  /** 表单标题（原 `<h4 className="text-sm font-semibold">` 头部；无头表单不传）。 */
  title?: string;
  /** 标题下的说明文案（仅与 title 同时出现）。 */
  description?: string;
  /** 取数加载中：渲染「加载中…」块并隐藏表单体（早退式表单在组件外先行 return，可不传）。 */
  loading?: boolean;
  saving: boolean;
  dirty: boolean;
  onSave: () => void | Promise<void>;
  onReset: () => void;
  /**
   * 表单体容器类名。逐字沿用各表单原布局：
   * 三元渲染式表单体为 `space-y-3`（默认）；整段早退式表单体为 `space-y-4`。
   */
  bodyClassName?: string;
  /** 按钮容器类名（绝大多数表单为 `flex gap-2 pt-1`；log-level 原为 `pt-2`）。 */
  actionsClassName?: string;
  children: ReactNode;
}

/**
 * Config 表单壳：标题/说明 + 加载块 + 表单体 + 保存/重置按钮。
 * 按钮块与原 14 处重复 JSX 逐字等价（保存中…/保存 + 脏态才出现的重置）。
 */
export function ConfigFormShell({
  title,
  description,
  loading = false,
  saving,
  dirty,
  onSave,
  onReset,
  bodyClassName = "space-y-3",
  actionsClassName = "flex gap-2 pt-1",
  children,
}: ConfigFormShellProps) {
  return (
    <div className="space-y-4">
      {title && (
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          {description && <p className={hintCls}>{description}</p>}
        </div>
      )}
      {loading ? (
        <ConfigFormLoading />
      ) : (
        <div className={bodyClassName}>
          {children}
          <div className={actionsClassName}>
            <Button size="sm" disabled={!dirty || saving} onClick={onSave}>
              {saving ? "保存中…" : "保存"}
            </Button>
            {dirty && (
              <Button
                size="sm"
                variant="outline"
                onClick={onReset}
                disabled={saving}
              >
                重置
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface SettingSwitchRowProps {
  /** 开关行主标签（`labelCls` 段落）。 */
  label: ReactNode;
  /** 开关行提示文案（`hintCls` 段落，可省略）。 */
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * 「label + hint + Switch」开关行（原 18 处重复的
 * `flex items-center justify-between rounded-lg border bg-muted/20 p-3` 块）。
 */
export function SettingSwitchRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: SettingSwitchRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
      <div>
        <p className={labelCls}>{label}</p>
        {hint && <p className={hintCls}>{hint}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}
