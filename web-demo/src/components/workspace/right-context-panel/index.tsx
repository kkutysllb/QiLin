"use client";

import { useCallback, useEffect, useRef } from "react";

import { useI18n } from "@/core/i18n/hooks";
import { useActiveThreadId } from "@/hooks/use-active-thread";
import { cn } from "@/lib/utils";

import { useWorkspaceLayout } from "../workspace-layout-context";

import { ResourcesSection } from "./sections/resources-section";
import { SubagentsSection } from "./sections/subagents-section";
import { TodosSection } from "./sections/todos-section";
import { WorkspaceChangesSection } from "./sections/workspace-changes-section";

export function RightContextPanel() {
  const { t } = useI18n();
  const { rightPanelOpen, rightPanelWidth, setRightPanelWidth } =
    useWorkspaceLayout();
  const threadId = useActiveThreadId();

  // 无会话页面（settings/mcp/crons 等）隐藏右面板
  const showPanel = rightPanelOpen && threadId !== null;

  return (
    <div className="hidden shrink-0 lg:flex">
      {showPanel && (
        <RightPanelResizeHandle
          width={rightPanelWidth}
          onResize={setRightPanelWidth}
        />
      )}
      <aside
        aria-label={t.rightPanel.title}
        className={cn(
          "overflow-hidden border-l bg-background transition-[width] duration-200",
          "flex flex-col",
        )}
        style={{ width: showPanel ? rightPanelWidth : 0 }}
      >
        {showPanel && (
          <div className="flex h-full flex-col overflow-y-auto">
            <TodosSection />
            <SubagentsSection />
            <WorkspaceChangesSection />
            <ResourcesSection threadId={threadId} />
          </div>
        )}
      </aside>
    </div>
  );
}

/* ── resize handle ────────────────────────────────────── */

/**
 * 右面板左侧拖拽手柄。
 *
 * 因为面板在窗口右侧，鼠标向左拖 = 面板变宽（delta 为负 → 宽度增加）。
 */
function RightPanelResizeHandle({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  const cleanupRef = useRef<(() => void) | null>(null);

  const stopDragging = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    document.body.classList.remove("select-none");
    document.body.classList.remove("cursor-col-resize");
  }, []);

  useEffect(() => stopDragging, [stopDragging]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    stopDragging();
    const startX = event.clientX;
    const startWidth = width;
    const handleMove = (moveEvent: PointerEvent) => {
      // 鼠标向左移动（delta 负）→ 面板变宽
      onResize(startWidth - (moveEvent.clientX - startX));
    };
    const handleUp = () => stopDragging();
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    document.body.classList.add("select-none");
    document.body.classList.add("cursor-col-resize");
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="调整右面板宽度"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onResize(width + 12);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onResize(width - 12);
        }
      }}
      className={cn(
        "w-px shrink-0 cursor-col-resize bg-border transition-colors",
        "hover:w-1 hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none",
      )}
    />
  );
}
