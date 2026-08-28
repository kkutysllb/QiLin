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
  useSidebar,
} from "@/components/ui/sidebar";
import { useI18n } from "@/core/i18n/hooks";
import { env } from "@/env";
import { cn } from "@/lib/utils";
import pkg from "../../../package.json";

export function WorkspaceHeader({ className }: { className?: string }) {
  const { t } = useI18n();
  const { state, toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const collapsed = state === "collapsed";

  return (
    <div
      className={cn(
        "flex flex-col gap-1 [-webkit-app-region:drag]",
        className,
      )}
    >
      {collapsed ? (
        <div className="flex items-center justify-center py-1">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={t.sidebar.expandSidebar}
            title={t.sidebar.expandSidebar}
            className="group/sidebar-logo rounded-md p-1 transition-colors hover:bg-sidebar-accent"
          >
            <QiLinLogo size={20} className="shrink-0" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-2 py-1">
          <QiLinLogo size={24} className="shrink-0" />
          {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" ? (
            <Link
              href="/"
              className="text-base font-bold text-foreground hover:text-foreground/80 transition-colors"
            >
              QiLin
            </Link>
          ) : (
            <span className="text-base font-bold text-foreground">
              QiLin
            </span>
          )}
          <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            v{pkg.version}
          </span>
        </div>
      )}
      {!collapsed && (
        <SidebarGroup className="p-0">
          <SidebarMenu className="[-webkit-app-region:no-drag]">
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={pathname === "/workspace/chats/new"}
                asChild
              >
                <Link
                  className="text-muted-foreground"
                  href="/workspace/chats/new"
                >
                  <MessageSquarePlus className="size-4 shrink-0" />
                  <span>{t.sidebar.newChat}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      )}
    </div>
  );
}
