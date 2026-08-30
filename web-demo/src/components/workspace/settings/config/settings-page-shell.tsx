"use client";

import { Loader2Icon, PowerIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface SettingsPageShellProps {
  /** 页头标题（原 `<h3 className="text-base font-semibold">`，可为 i18n 节点）。 */
  title: ReactNode;
  /** 页头描述文案（可为 i18n 节点）。 */
  description: ReactNode;
  /** 来自 useApplyAndRestart 的重启中状态。 */
  restarting: boolean;
  /** 来自 useApplyAndRestart 的 applyAndRestart。 */
  onRestart: () => void;
  children: ReactNode;
}

/**
 * 设置包装页的页头 + 「应用并重启」条（原 6 个设置页逐字同构的块）。
 * 页面仍自行调用 useApplyAndRestart 并以 props 注入状态与回调。
 */
export function SettingsPageShell({
  title,
  description,
  restarting,
  onRestart,
  children,
}: SettingsPageShellProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          size="sm"
          onClick={onRestart}
          disabled={restarting}
          className="w-fit gap-1.5 self-start sm:self-auto"
        >
          {restarting ? (
            <>
              <Loader2Icon className="size-3.5 animate-spin" />
              重启中…
            </>
          ) : (
            <>
              <PowerIcon className="size-3.5" />
              应用并重启
            </>
          )}
        </Button>
      </div>
      {children}
    </div>
  );
}
