"use client";

import { Loader2Icon, PowerIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { isDesktopBackendManagedMode } from "@/core/config";
import { restartBackend } from "@/core/desktop";
import { useI18n } from "@/core/i18n/hooks";
import { restartGateway, waitForGateway } from "@/core/settings-config/api";

/**
 * 设置页顶部跨 section 的全局后端维护操作条。
 *
 * 打包桌面端走 Electron 托盘重启；Web 与桌面 dev 走 gateway 自重启 API +
 * health 轮询。逻辑抽自原 ConfigSettingsPage，以便所有 section 共用。
 */
export function BackendControlBar() {
  const { t } = useI18n();
  const [restarting, setRestarting] = useState(false);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      if (isDesktopBackendManagedMode()) {
        const ok = await restartBackend();
        if (ok) {
          toast.success(t.settings.backend.restartSuccess);
        } else {
          toast.error(t.settings.backend.restartFailedTray);
        }
      } else {
        toast.info(t.settings.backend.restartingToast);
        try {
          await restartGateway();
        } catch {
          // 连接重置是预期内的关闭信号
        }
        const ok = await waitForGateway(30_000, 1_000);
        if (ok) {
          toast.success(t.settings.backend.restartSuccess);
        } else {
          toast.error(t.settings.backend.restartTimeout);
        }
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t.settings.backend.restartFailed,
      );
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="bg-muted/30 mb-6 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{t.settings.backend.title}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t.settings.backend.description}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleRestart}
        disabled={restarting}
        className="shrink-0 gap-1.5"
      >
        {restarting ? (
          <>
            <Loader2Icon className="size-3.5 animate-spin" />
            {t.settings.backend.restarting}
          </>
        ) : (
          <>
            <PowerIcon className="size-3.5" />
            {t.settings.backend.restartButton}
          </>
        )}
      </Button>
    </div>
  );
}
