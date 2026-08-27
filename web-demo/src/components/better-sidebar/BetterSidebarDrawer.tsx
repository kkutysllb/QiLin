"use client";
import { useEffect, useState } from "react";

import { BetterSidebarRoot } from "./BetterSidebarRoot";

/**
 * < 768px 视口的 Better Sidebar 兜底形态：固定在底部的 bottom sheet。
 *
 * 桌面端（> 768px）不渲染 —— 桌面右栏由 workspace-content 的
 * BetterSidebarMount 负责；两者互斥，保证同一时刻只有一个 BetterSidebarRoot。
 */
export function BetterSidebarDrawer({ threadId }: { threadId: string }) {
  const [isMobile, setIsMobile] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (!isMobile) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full border-t px-4 py-2 text-left text-sm"
      >
        {open ? "关闭侧栏" : "打开侧栏"}
      </button>
      {open && (
        <div className="h-[60vh] border-t">
          <BetterSidebarRoot threadId={threadId} open />
        </div>
      )}
    </div>
  );
}
