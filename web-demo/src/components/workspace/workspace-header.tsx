"use client";

import { MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { QiLinLogo } from "@/components/kworks-logo";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { isStaticWebsiteOnly } from "@/core/config";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

import pkg from "../../../package.json";

/**
 * Sidebar header: brand row + the New Task primary action.
 *
 * Mirrors the DSH ui-sidebar rail contract: expanded, New Task is a full
 * width 38px bar (border + elevated fill, 12px radius); collapsed it snaps
 * to the same 32px icon box as every other rail control (shadcn icon-mode
 * size-8) with a tooltip carrying the label. The collapsed rail's logo is
 * the expand toggle.
 */
export function WorkspaceHeader({ className }: { className?: string }) {
  const { t } = useI18n();
  const { state, toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const collapsed = state === "collapsed";

  return (
    <div
      className={cn("flex flex-col gap-1 [-webkit-app-region:drag]", className)}
    >
      {collapsed ? (
        <div className="flex items-center justify-center py-1">
          <button
            type="button"
            onClick={toggleSidebar}
            data-testid="workspace-sidebar-trigger"
            aria-label={t.sidebar.expandSidebar}
            title={t.sidebar.expandSidebar}
            className="group/sidebar-logo hover:bg-sidebar-accent flex size-8 items-center justify-center rounded-md transition-colors"
          >
            <QiLinLogo size={20} className="shrink-0" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-2 py-1 [-webkit-app-region:no-drag]">
          <QiLinLogo size={24} className="shrink-0" />
          {isStaticWebsiteOnly ? (
            <Link
              href="/"
              className="text-foreground hover:text-foreground/80 text-base font-bold transition-colors"
            >
              QiLin
            </Link>
          ) : (
            <span className="text-foreground text-base font-bold">QiLin</span>
          )}
          <span className="border-border/60 bg-muted/40 text-muted-foreground inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
            v{pkg.version}
          </span>
          {/* 折叠侧边栏：从 topbar 挪入品牌行右端；折叠态由上方 logo
              按钮接管展开（同 testid，互斥渲染，e2e 两态均可点） */}
          <SidebarTrigger
            data-testid="workspace-sidebar-trigger"
            className="ml-auto size-7"
          />
        </div>
      )}
      <SidebarGroup className="p-0">
        <SidebarMenu className="[-webkit-app-region:no-drag]">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname === "/workspace/chats/new"}
              tooltip={t.sidebar.newChat}
              className={cn(
                collapsed
                  ? "size-8 bg-transparent"
                  : "bg-background text-foreground hover:bg-muted h-9 justify-center rounded-lg border px-3 font-medium shadow-xs",
              )}
            >
              <Link href="/workspace/chats/new">
                <MessageSquarePlus className="size-4 shrink-0" />
                <span>{t.sidebar.newChat}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </div>
  );
}
