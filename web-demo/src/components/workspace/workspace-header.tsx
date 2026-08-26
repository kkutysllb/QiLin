"use client";

import { MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { KWorksLogo } from "@/components/kworks-logo";
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

export function WorkspaceHeader({ className }: { className?: string }) {
  const { t } = useI18n();
  const { state } = useSidebar();
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
          <KWorksLogo size={20} className="shrink-0" />
        </div>
      ) : (
        <div className="flex items-center gap-2 px-2 py-1">
          <KWorksLogo size={24} className="shrink-0" />
          {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" ? (
            <Link
              href="/"
              className="text-base font-bold text-foreground hover:text-foreground/80 transition-colors"
            >
              KWorks
            </Link>
          ) : (
            <span className="text-base font-bold text-foreground">
              KWorks
            </span>
          )}
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
