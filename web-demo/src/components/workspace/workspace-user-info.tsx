"use client";

import {
  LogOutIcon,
  Settings2Icon,
  ShieldCheckIcon,
  UserIcon,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/core/auth/AuthProvider";
import { useI18n } from "@/core/i18n/hooks";

import { useWorkspaceLayout } from "./workspace-layout-context";
import { UpdateInstallBadge } from "./update-install-badge";

function getRoleLabel(
  role: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return role === "admin"
    ? t.workspace.userInfo.admin
    : t.workspace.userInfo.user;
}

export function WorkspaceUserInfo() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { openSettings } = useWorkspaceLayout();

  if (!user) return null;

  const avatar = (
    <Avatar className="size-8 shrink-0 ring-2 ring-offset-1 ring-offset-background ring-zinc-400/40">
      <AvatarFallback className="bg-gradient-to-br from-zinc-500 via-zinc-600 to-neutral-700 text-white text-sm font-bold shadow-sm">
        <UserIcon className="size-4" />
      </AvatarFallback>
    </Avatar>
  );

  // Single aggregated entry: opens the settings page (default `general`)
  // where the previously-separate items (memory summary, token usage,
  // MCP) live as in-page sections. Keeps the user menu compact.
  const settingsMenuItem = (
    <DropdownMenuItem onClick={() => openSettings("general")}>
      <Settings2Icon className="size-4" />
      {t.workspace.settings}
    </DropdownMenuItem>
  );

  const userInfoLabel = (
    <DropdownMenuLabel className="font-normal">
      <div className="flex flex-col gap-1">
        <p className="truncate text-sm font-medium">{user.email}</p>
        <div className="flex items-center gap-1.5">
          <ShieldCheckIcon className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">
            {getRoleLabel(user.system_role, t)}
          </span>
        </div>
      </div>
    </DropdownMenuLabel>
  );

  const logoutItem = (
    <DropdownMenuItem onClick={logout}>
      <LogOutIcon className="size-4" />
      {t.workspace.logout}
    </DropdownMenuItem>
  );

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 pt-2">
        <Separator className="mb-1" />
        <UpdateInstallBadge />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="outline-none">
              {avatar}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            collisionPadding={8}
            className="min-w-52"
          >
            {userInfoLabel}
            <DropdownMenuSeparator />
            {settingsMenuItem}
            <DropdownMenuSeparator />
            {logoutItem}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="px-2 pt-2">
      <Separator className="mb-3" />
      <div className="flex w-full items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                {avatar}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">
                    {user.email}
                  </p>
                  <p className="text-muted-foreground truncate text-xs leading-tight">
                    {getRoleLabel(user.system_role, t)}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="end"
              collisionPadding={8}
              className="min-w-52"
            >
              {userInfoLabel}
              <DropdownMenuSeparator />
              {settingsMenuItem}
              <DropdownMenuSeparator />
              {logoutItem}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <UpdateInstallBadge className="mr-0.5" />
      </div>
    </div>
  );
}
