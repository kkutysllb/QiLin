// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { Sidebar, SidebarContent, SidebarProvider } from "@/components/ui/sidebar";
import { RecentChatList } from "@/components/workspace/recent-chat-list";
import {
  WorkspaceLayoutProvider,
} from "@/components/workspace/workspace-layout-context";
import type { AgentThread } from "@/core/threads/types";

const threadsFixture: AgentThread[] = [
  {
    thread_id: "t-owned",
    updated_at: "2026-03-02T00:00:00Z",
    values: { title: "已归组任务", messages: [], artifacts: [] },
  },
  {
    thread_id: "t-loose",
    updated_at: "2026-03-01T00:00:00Z",
    values: { title: "未分组任务", messages: [], artifacts: [] },
  },
] as unknown as AgentThread[];

const treeFixture = {
  workspaces: [
    {
      id: "ws-1",
      path: "/projects/demo",
      title: "",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      position: 0,
      thread_ids: ["t-owned"],
    },
  ],
  ungrouped_thread_ids: ["t-loose"],
  archived_thread_ids: [],
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/workspace/chats/t-owned",
}));

// i18n 桩必须提供真实两级结构：组件沿 t.<section>.<key> 取值。
vi.mock("@/core/i18n/hooks", () => ({
  useI18n: () => ({ locale: "zh-CN", t }),
}));

const t = {
  sidebar: {
    recentChats: "历史任务",
    ungroupedGroup: "未分组",
    archivedSection: "已归档",
    archiveThread: "归档",
    unarchiveThread: "取消归档",
    moveToWorkspace: "移动到工作区",
    renameWorkspace: "重命名工作区",
    deleteWorkspaceAction: "删除工作区",
    deleteWorkspaceHint: "",
    moveUpItem: "上移",
    moveDownItem: "下移",
    emptyWorkspaceCount: "空",
  },
  common: {
    rename: "重命名",
    share: "分享",
    export: "导出",
    exportAsMarkdown: "Markdown",
    exportAsJSON: "JSON",
    cancel: "取消",
    save: "保存",
    delete: "删除",
    more: "更多",
    exportSuccess: "已导出",
  },
  conversation: { noMessages: "无消息" },
  clipboard: { linkCopied: "已复制", failedToCopyToClipboard: "复制失败" },
};

vi.mock("@/core/threads/hooks", () => ({
  useThreads: () => ({ data: threadsFixture }),
  useDeleteThread: () => ({ mutate: vi.fn() }),
  useRenameThread: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/core/threads/prefetch", () => ({
  prefetchThreadState: vi.fn(),
}));
vi.mock("@/core/api", () => ({
  getAPIClient: () => ({ threads: {} }),
}));

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_STATIC_WEBSITE_ONLY: "true" },
}));

const treeQueryData = { current: treeFixture };
vi.mock("@/core/workspaces/hooks", () => ({
  useWorkspaceTree: () => ({ data: treeQueryData.current }),
  useArchiveThreads: () => ({ mutateAsync: vi.fn() }),
  useAttachThread: () => ({ mutateAsync: vi.fn() }),
  useDeleteWorkspace: () => ({ mutateAsync: vi.fn() }),
  useDetachThread: () => ({ mutateAsync: vi.fn() }),
  useRenameWorkspace: () => ({ mutateAsync: vi.fn() }),
  useReorderThread: () => ({ mutateAsync: vi.fn() }),
  useReorderWorkspace: () => ({ mutateAsync: vi.fn() }),
  useUnarchiveThreads: () => ({ mutateAsync: vi.fn() }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <WorkspaceLayoutProvider>
        <TestSidebarHost>{children}</TestSidebarHost>
      </WorkspaceLayoutProvider>
    </QueryClientProvider>
  );
}

// SidebarGroup 原语依赖 SidebarProvider（useSidebar ctx）；
// 这里以最小配置挂真 Provider 而非 mock 组件内部。
function TestSidebarHost({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarContent>{children}</SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("RecentChatList 工作区分组渲染", () => {
  test("渲染工作组与尾随 Ungrouped，行投影在展开组内", async () => {
    render(<RecentChatList />, { wrapper: Wrapper });
    // 组标签回退链：title 为空串 → basename
    await waitFor(() => screen.getByText("demo"));
    expect(screen.getByText("未分组")).toBeTruthy();
    expect(screen.getByText("已归组任务")).toBeTruthy();
    expect(screen.getByText("未分组任务")).toBeTruthy();
  });

  test("点击组头折叠后行消失且折叠键持久化", async () => {
    render(<RecentChatList />, { wrapper: Wrapper });
    await waitFor(() => screen.getByText("demo"));
    const header = screen.getByText("demo").closest("button")!;
    fireEvent.click(header);
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem("kworks.workspace.collapsedGroups") ?? "[]"),
      ).toContain("ws-1"),
    );
    expect(screen.queryByText("已归组任务")).toBeNull();
    // Ungrouped 不受影响
    expect(screen.getByText("未分组任务")).toBeTruthy();
  });

  test("containsCurrent 的组头带活动着色", async () => {
    render(<RecentChatList />, { wrapper: Wrapper });
    await waitFor(() => screen.getByText("demo"));
    const activeHeader = screen.getByText("demo").closest("button")!;
    expect(activeHeader.className).toContain("bg-muted/60");
    const looseHeader = screen.getByText("未分组").closest("button")!;
    expect(looseHeader.className).not.toContain("bg-muted/60");
  });

  test("历史段折叠时只保留标题条", async () => {
    localStorage.setItem("kworks.workspace.historyCollapsed", "true");
    const view = render(<RecentChatList />, { wrapper: Wrapper });
    await waitFor(() => expect(view.container.textContent).toContain("历史任务"));
    expect(screen.queryByText("demo")).toBeNull();
  });
});
