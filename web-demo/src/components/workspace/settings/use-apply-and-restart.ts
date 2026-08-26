"use client";

import { useState } from "react";
import { toast } from "sonner";

import { isDesktopBackendManagedMode } from "@/core/config";
import { restartBackend } from "@/core/desktop";
import { restartGateway, waitForGateway } from "@/core/settings-config/api";

/**
 * Shared hook for the 「应用并重启」 button.
 *
 * - managed desktop mode: restarts the Electron-managed gateway via IPC
 * - dev / web mode: triggers gateway self-restart API + polls /health
 *
 * Extracted from config-settings-page.tsx so the new data-persistence page
 * and the existing config page share identical restart semantics.
 */
export function useApplyAndRestart() {
  const [restarting, setRestarting] = useState(false);

  const applyAndRestart = async () => {
    if (!confirm("确定要重启后端使配置生效吗？重启期间服务将短暂不可用。")) {
      return;
    }
    setRestarting(true);
    try {
      if (isDesktopBackendManagedMode()) {
        const result = await restartBackend();
        if (result) {
          toast.success("后端已重启，配置已生效");
        } else {
          toast.error("重启失败，请查看托盘菜单手动重启");
        }
      } else {
        // Web and desktop dev: backend self-restart via API + health polling.
        toast.info("正在重启后端…");
        try {
          await restartGateway();
        } catch {
          // Connection reset is expected during shutdown
        }
        // Wait for gateway to come back online
        const ok = await waitForGateway(30_000, 1_000);
        if (ok) {
          toast.success("后端已重启，配置已生效");
        } else {
          toast.error("后端重启超时，请检查服务状态");
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重启失败");
    } finally {
      setRestarting(false);
    }
  };

  return { restarting, applyAndRestart };
}
