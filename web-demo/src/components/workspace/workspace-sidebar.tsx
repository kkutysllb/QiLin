"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

import { RecentChatList } from "./recent-chat-list";
import { SidebarResizeHandle } from "./sidebar-resize-handle";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceUserInfo } from "./workspace-user-info";

export function WorkspaceSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { open: isSidebarOpen, state } = useSidebar();
  return (
    <>
      <Sidebar variant="sidebar" collapsible="icon" {...props}>
        {/* Per-platform top pad comes from .kworks-win-pad-top in
            globals.css: macOS reserves the traffic-light strip (2.5rem),
            Windows frameless gets a compact pad, plain web gets none.
            Do NOT add a static pt-* here — it would blank-strip the web UI. */}
        <SidebarHeader className="kworks-win-pad-top pb-0">
          <WorkspaceHeader />
        </SidebarHeader>
        <SidebarContent>{isSidebarOpen && <RecentChatList />}</SidebarContent>
        <SidebarFooter>
          <WorkspaceUserInfo />
        </SidebarFooter>
        <SidebarRail />
        <SidebarResizeHandle collapsed={state === "collapsed"} />
      </Sidebar>
    </>
  );
}
