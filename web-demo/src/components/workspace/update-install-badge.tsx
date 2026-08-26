"use client";

import { DownloadIcon, LoaderIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  installUpdate,
  subscribeUpdateReady,
  type UpdateReadyInfo,
} from "@/core/desktop/updater";
import { cn } from "@/lib/utils";

import { Tooltip } from "./tooltip";

/**
 * UpdateInstallBadge — the hidden download icon next to the sidebar user
 * info. It stays invisible until a new version has been fully downloaded
 * in the background (electron-updater `autoDownload=true`), then appears
 * as a download button with a red dot. One click quits the app, installs
 * the new version, and relaunches.
 */
export function UpdateInstallBadge({
  className,
}: {
  className?: string;
}) {
  const [ready, setReady] = useState<UpdateReadyInfo | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => subscribeUpdateReady(setReady), []);

  const handleInstall = useCallback(() => {
    setInstalling(true);
    void installUpdate().then((ok) => {
      // If install failed, re-enable the button so the user can retry.
      if (!ok) setInstalling(false);
      // If ok, electron-updater quits & relaunches the app automatically.
    });
  }, []);

  if (!ready) return null;

  return (
    <Tooltip content={`更新已就绪 v${ready.version}，点击安装并重启`}>
      <button
        type="button"
        aria-label={`安装新版本 v${ready.version} 并重启`}
        onClick={handleInstall}
        disabled={installing}
        className={cn(
          "text-muted-foreground hover:text-foreground relative flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-sidebar-accent",
          className,
        )}
      >
        {installing ? (
          <LoaderIcon className="size-3.5 animate-spin" />
        ) : (
          <DownloadIcon className="size-3.5" />
        )}
        {!installing && (
          <span className="bg-red-500 absolute top-1 right-1 size-1.5 rounded-full" />
        )}
      </button>
    </Tooltip>
  );
}