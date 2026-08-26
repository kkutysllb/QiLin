"use client";

import { PanelRightIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBackendStatus } from "@/core/desktop/use-backend-status";
import { useI18n } from "@/core/i18n/hooks";
import { useModels } from "@/core/models/hooks";
import { stripUploadedFilesTag } from "@/core/messages/utils";
import { useActiveThreadMessages } from "@/hooks/use-active-thread";
import { cn } from "@/lib/utils";

import { TokenUsageIndicator } from "./token-usage-indicator";
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
  return <span className={cn("size-2 rounded-full", color)} aria-hidden="true" />;
}

function pageTitle(
  pathname: string | null,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (!pathname) return t.topbar.noActiveSession;
  if (pathname.startsWith("/workspace/chats")) return t.breadcrumb.chats;
  if (pathname.startsWith("/workspace/agents")) return t.sidebar.agents;
  if (pathname.startsWith("/workspace/crons")) return t.sidebar.crons;
  if (pathname.startsWith("/workspace/token-usage"))
    return t.sidebar.tokenUsage;
  return t.breadcrumb.workspace;
}

export function WorkspaceTopbar() {
  const { t } = useI18n();
  const { state } = useSidebar();
  const pathname = usePathname();
  const backendStatus = useBackendStatus();
  const { rightPanelOpen, toggleRightPanel } = useWorkspaceLayout();
  const { messages, values } = useActiveThreadMessages();
  const { tokenUsageEnabled } = useModels();

  const collapsed = state === "collapsed";
  const statusLabel =
    backendStatus === "connected"
      ? t.topbar.backendConnected
      : backendStatus === "disconnected"
        ? t.topbar.backendDisconnected
        : t.topbar.backendChecking;

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-12 shrink-0 items-center border-b bg-background/80 backdrop-blur-sm",
        "[-webkit-app-region:drag]",
        // Windows frameless shell: keep the toolbar buttons and session tag
        // clear of the native window-control overlay (minimize / maximize /
        // close) pinned to the top-right. Resolves to 0px everywhere else.
        "pr-[var(--kworks-titlebar-inset)]",
        collapsed && "pl-[78px]",
      )}
    >
      {/* 左段：折叠按钮 */}
      <div className="flex items-center [-webkit-app-region:no-drag]">
        <SidebarTrigger
          data-testid="workspace-sidebar-trigger"
          className="size-7"
        />
      </div>

      {/* 中段：当前会话标题（动态）｜ 状态 */}
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <span className="truncate text-sm font-medium">
          {values?.title ? stripUploadedFilesTag(values.title) || pageTitle(pathname, t) : pageTitle(pathname, t)}
        </span>
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

      {/* 右段：token 计数 ｜ 右面板开关 */}
      <div className="flex items-center gap-1 pr-2 [-webkit-app-region:no-drag]">
        {/* 仅在有会话消息时显示 token 计数，避免设置/技能等页面出现空计数 */}
        {tokenUsageEnabled && messages.length > 0 && (
          <TokenUsageIndicator enabled messages={messages} />
        )}
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
