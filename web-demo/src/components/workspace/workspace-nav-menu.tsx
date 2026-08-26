"use client";

import {
  ChevronsUpDown,
  GaugeIcon,
  ScrollTextIcon,
  Settings2Icon,
  SettingsIcon,
  WrenchIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useI18n } from "@/core/i18n/hooks";

import { useWorkspaceLayout } from "./workspace-layout-context";

type SettingsSection =
  | "general"
  | "memorySummary"
  | "tokenUsageBudget"
  | "mcp";

const MENU_ITEMS: {
  id: SettingsSection;
  icon: typeof Settings2Icon;
  labelKey: "general" | "memorySummary" | "tokenUsageBudget" | "mcp";
}[] = [
  { id: "general", icon: Settings2Icon, labelKey: "general" },
  { id: "memorySummary", icon: ScrollTextIcon, labelKey: "memorySummary" },
  { id: "tokenUsageBudget", icon: GaugeIcon, labelKey: "tokenUsageBudget" },
  { id: "mcp", icon: WrenchIcon, labelKey: "mcp" },
];

function NavMenuButtonContent({
  isSidebarOpen,
  t,
}: {
  isSidebarOpen: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return isSidebarOpen ? (
    <div className="flex w-full items-center gap-2 text-left text-sm">
      <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-slate-500 via-zinc-500 to-neutral-600 text-white">
        <SettingsIcon className="size-3" />
      </span>
      <span className="text-muted-foreground">{t.workspace.settingsAndMore}</span>
      <ChevronsUpDown className="text-muted-foreground ml-auto size-4" />
    </div>
  ) : (
    <div className="flex size-full items-center justify-center">
      <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-slate-500 via-zinc-500 to-neutral-600 text-white">
        <SettingsIcon className="size-3" />
      </span>
    </div>
  );
}

export function WorkspaceNavMenu() {
  const [mounted, setMounted] = useState(false);
  const { open: isSidebarOpen } = useSidebar();
  const { t } = useI18n();
  const { openSettings } = useWorkspaceLayout();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SidebarMenu className="w-full">
        <SidebarMenuItem>
          {mounted ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <NavMenuButtonContent isSidebarOpen={isSidebarOpen} t={t} />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                align="end"
                sideOffset={4}
              >
                {MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      onClick={() => openSettings(item.id)}
                    >
                      <Icon className="size-4" />
                      {t.settings.sections[item.labelKey]}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <NavMenuButtonContent isSidebarOpen={isSidebarOpen} t={t} />
            </SidebarMenuButton>
          )}
        </SidebarMenuItem>
      </SidebarMenu>
  );
}
