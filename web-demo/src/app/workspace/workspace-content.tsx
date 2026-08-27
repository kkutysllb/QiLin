"use client";

import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { BetterSidebarRoot } from "@/components/better-sidebar/BetterSidebarRoot";
import { PromptInputProvider } from "@/components/ai-elements/prompt-input";
import { QueryClientProvider } from "@/components/query-client-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ArtifactsProvider } from "@/components/workspace/artifacts";
import { CommandPalette } from "@/components/workspace/command-palette";
import { RightContextPanel } from "@/components/workspace/right-context-panel";
import { SettingsView } from "@/components/workspace/settings";
import {
  WorkspaceLayoutProvider,
  useWorkspaceLayout,
} from "@/components/workspace/workspace-layout-context";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { WorkspaceTopbar } from "@/components/workspace/workspace-topbar";
import { useActiveThreadId } from "@/hooks/use-active-thread";
import { SubtasksProvider } from "@/core/tasks/context";

// Desktop static export: no cookies() access
export function WorkspaceContent({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <QueryClientProvider>
      <WorkspaceLayoutProvider>
        <WorkspaceContentInner>{children}</WorkspaceContentInner>
      </WorkspaceLayoutProvider>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}

function WorkspaceContentInner({ children }: { children: ReactNode }) {
  const {
    settingsOpen,
    settingsSection,
    openSettings,
    closeSettings,
    rightPanelMode,
  } = useWorkspaceLayout();

  if (settingsOpen) {
    return (
      <>
        <CommandPalette />
        <SettingsView
          activeSection={settingsSection}
          onSelectSection={(id) => openSettings(id)}
          onBack={closeSettings}
        />
      </>
    );
  }

  return (
    <SidebarProvider className="h-screen" defaultOpen={true}>
      <WorkspaceSidebar />
      <SidebarInset className="min-w-0">
        {/*
         * 数据 Provider 必须位于 SidebarProvider 内部，因为
         * ArtifactsProvider 调用了 useSidebar()（用于侧边栏折叠联动）。
         */}
        <SubtasksProvider>
          <ArtifactsProvider>
            <PromptInputProvider>
              <WorkspaceTopbar />
              <div className="flex min-h-0 flex-1">
                <main className="min-w-0 flex-1">{children}</main>
                {rightPanelMode === "sidebar" ? (
                  <BetterSidebarMount />
                ) : (
                  <RightContextPanel />
                )}
              </div>
            </PromptInputProvider>
          </ArtifactsProvider>
        </SubtasksProvider>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}

/**
 * rightPanelMode === "sidebar" 时的右栏挂载点。
 *
 * 可见性语义与 RightContextPanel 对齐：
 * - 随 `rightPanelOpen` / `rightPanelWidth`（同一宽度状态，设计 §5.1）；
 * - 无活跃会话（settings/mcp/crons 等页面或新建会话页）时隐藏；
 * - 仅桌面端（lg+）占位渲染，移动端由 BetterSidebarDrawer 兜底。
 */
function BetterSidebarMount() {
  const { rightPanelOpen, rightPanelWidth } = useWorkspaceLayout();
  const threadId = useActiveThreadId();
  const showPanel = rightPanelOpen && threadId !== null;

  return (
    <div className="hidden shrink-0 lg:flex">
      <aside
        aria-label="Better Sidebar"
        className="flex flex-col overflow-hidden border-l bg-background transition-[width] duration-200"
        style={{ width: showPanel ? rightPanelWidth : 0 }}
      >
        {showPanel && threadId !== null && (
          <BetterSidebarRoot threadId={threadId} open={rightPanelOpen} />
        )}
      </aside>
    </div>
  );
}
