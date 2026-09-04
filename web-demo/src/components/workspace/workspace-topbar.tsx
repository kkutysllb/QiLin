"use client";

import { FolderOpenIcon, PanelRightIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openFolder } from "@/core/desktop";
import { useBackendStatus } from "@/core/desktop/use-backend-status";
import { useI18n } from "@/core/i18n/hooks";
import { stripUploadedFilesTag } from "@/core/messages/utils";
import { useWorkspaceTree } from "@/core/workspaces/hooks";
import { useActiveThreadMessages, useActiveThreadId } from "@/hooks/use-active-thread";
import { cn } from "@/lib/utils";

import { useWorkspaceLayout } from "./workspace-layout-context";

function StatusDot({
  status,
}: {
  status: "connected" | "disconnected" | "checking";
}) {
  const color =
    status === "connected"
      ? "bg-emerald-500"
      : status === "disconnected"
        ? "bg-rose-500"
        : "bg-amber-500";
  return (
    <span className={cn("size-2 rounded-full", color)} aria-hidden="true" />
  );
}

function pageTitle(
  pathname: string | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (!pathname) return t.topbar.noActiveSession;
  if (pathname.startsWith("/workspace/chats")) return t.breadcrumb.chats;
  if (pathname.startsWith("/workspace/agents")) return t.sidebar.agents;
  if (pathname.startsWith("/workspace/token-usage"))
    return t.sidebar.tokenUsage;
  return t.breadcrumb.workspace;
}

export function WorkspaceTopbar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const backendStatus = useBackendStatus();
  const { rightPanelOpen, toggleRightPanel } = useWorkspaceLayout();
  const { values } = useActiveThreadMessages();
  const threadId = useActiveThreadId();
  const { data: workspaceTree } = useWorkspaceTree();

  // 当前会话绑定的注册表工作区（后端权威绑定，含拖拽归组）。用于在任务
  // 标题前显示「工作区 / 任务」，点击工作区名在系统文件管理器中打开目录。
  const boundWorkspace = useMemo(
    () =>
      threadId && workspaceTree
        ? workspaceTree.workspaces.find((ws) =>
            ws.thread_ids.includes(threadId),
          )
        : undefined,
    [threadId, workspaceTree],
  );

  const statusLabel =
    backendStatus === "connected"
      ? t.topbar.backendConnected
      : backendStatus === "disconnected"
        ? t.topbar.backendDisconnected
        : t.topbar.backendChecking;

  const titleText = values?.title
    ? stripUploadedFilesTag(values.title) || pageTitle(pathname, t)
    : pageTitle(pathname, t);

  return (
    <header
      className={cn(
        "bg-background/80 sticky top-0 z-20 flex h-12 shrink-0 items-center border-b backdrop-blur-sm",
        "[-webkit-app-region:drag]",
        // Windows frameless shell: keep the toolbar buttons and session tag
        // clear of the native window-control overlay (minimize / maximize /
        // close) pinned to the top-right. Resolves to 0px everywhere else.
        "pr-[var(--kworks-titlebar-inset)]",
      )}
    >
      {/* 会话标题（动态，前缀工作区名可点击打开目录）｜ 状态。折叠侧边栏
          按钮已挪至侧边栏底栏右端（workspace-user-info），topbar 不再重复
          放置。 */}
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        {boundWorkspace && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  // 桌面壳的标题栏是拖拽区，可点元素必须显式声明 no-drag。
                  className={cn(
                    "[-webkit-app-region:no-drag]",
                    "text-muted-foreground hover:text-foreground flex min-w-0 shrink items-center gap-1 text-sm transition-colors",
                  )}
                  onClick={() => void openFolder(boundWorkspace.path)}
                  aria-label={boundWorkspace.path}
                >
                  <FolderOpenIcon className="size-3.5 shrink-0" />
                  <span className="max-w-[12rem] truncate">
                    {boundWorkspace.title}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{boundWorkspace.path}</TooltipContent>
            </Tooltip>
            <span className="text-muted-foreground/40 shrink-0">/</span>
          </>
        )}
        <span className="truncate text-sm font-medium">{titleText}</span>
        <Separator orientation="vertical" className="h-4" />
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5">
              <StatusDot status={backendStatus} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{statusLabel}</TooltipContent>
        </Tooltip>
      </div>

      {/* 右段：右面板开关 */}
      <div className="flex items-center gap-1 pr-2 [-webkit-app-region:no-drag]">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={toggleRightPanel}
              aria-label={t.topbar.toggleRightPanel}
              aria-pressed={rightPanelOpen}
            >
              <PanelRightIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t.topbar.toggleRightPanel}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
