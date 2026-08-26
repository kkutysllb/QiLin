"use client";

import {
  ClockIcon,
  SparklesIcon,
  TerminalIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useI18n } from "@/core/i18n/hooks";

import { useWorkspaceLayout } from "./workspace-layout-context";

export function WorkspaceNavChatList() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { openSettings } = useWorkspaceLayout();

  return (
    <SidebarGroup className="pt-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => openSettings("skill")}
            tooltip={t.sidebar.skills}
          >
            <SparklesIcon className="size-4 shrink-0" />
            <span>{t.sidebar.skills}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={() => openSettings("mcp")}
            tooltip={t.sidebar.mcp}
          >
            <TerminalIcon className="size-4 shrink-0" />
            <span>{t.sidebar.mcp}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname.startsWith("/workspace/crons")}
            asChild
          >
            <Link href="/workspace/crons">
              <ClockIcon className="size-4 shrink-0" />
              <span>{t.sidebar.crons}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}