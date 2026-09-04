// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { WorkspaceTopbar } from "@/components/workspace/workspace-topbar";
import {
  WorkspaceLayoutProvider,
} from "@/components/workspace/workspace-layout-context";

// ── hoisted mock 状态 ────────────────────────────────────────────────
const topbarMock = vi.hoisted(() => ({
  threadId: null as string | null,
  title: "全面分析这个项目",
  openFolder: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/chats/t-1",
}));

vi.mock("@/core/desktop/use-backend-status", () => ({
  useBackendStatus: () => "connected",
}));

vi.mock("@/core/desktop", () => ({
  openFolder: (...args: unknown[]) => topbarMock.openFolder(...args),
}));

// 活跃会话 hook 桩：threadId 与标题可控。
vi.mock("@/hooks/use-active-thread", () => ({
  useActiveThreadId: () => topbarMock.threadId,
  useActiveThreadMessages: () => ({
    values: { title: topbarMock.title },
    messages: [],
  }),
}));

// 工作区树桩：一个已归组工作区（含 t-1），一个未含该线程。
vi.mock("@/core/workspaces/hooks", () => ({
  useWorkspaceTree: () => ({
    data: {
      workspaces: [
        {
          id: "ws-1",
          path: "/projects/dsh-desktop",
          title: "DSH-Desktop",
          created_at: "",
          updated_at: "",
          position: 0,
          thread_ids: ["t-1"],
        },
        {
          id: "ws-2",
          path: "/projects/other",
          title: "Other",
          created_at: "",
          updated_at: "",
          position: 1,
          thread_ids: ["t-other"],
        },
      ],
      ungrouped_thread_ids: [],
      archived_thread_ids: [],
    },
  }),
}));

// i18n 桩：topbar 仅取 pageTitle 相关 key。
vi.mock("@/core/i18n/hooks", () => ({
  useI18n: () => ({
    locale: "zh-CN",
    t: {
      topbar: {
        noActiveSession: "无活跃会话",
        backendConnected: "已连接",
        backendDisconnected: "已断开",
        backendChecking: "检查中",
        toggleRightPanel: "切换右面板",
      },
      breadcrumb: { chats: "任务", workspace: "工作区" },
      sidebar: { agents: "Agent", tokenUsage: "用量" },
      pages: { untitled: "未命名", newChat: "新任务", appName: "QiLin" },
    },
  }),
}));

function renderTopbar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceLayoutProvider>
        <WorkspaceTopbar />
      </WorkspaceLayoutProvider>
    </QueryClientProvider>,
  );
}

describe("WorkspaceTopbar 工作区前缀", () => {
  test("会话绑定工作区时显示「工作区 / 任务标题」，点击打开工作区目录", async () => {
    topbarMock.threadId = "t-1";
    topbarMock.openFolder.mockClear();
    renderTopbar();

    // 分隔符两侧：工作区名与任务标题同屏可见
    expect(screen.getByText("DSH-Desktop")).toBeTruthy();
    expect(screen.getByText("全面分析这个项目")).toBeTruthy();

    const button = screen.getByRole("button", {
      name: "/projects/dsh-desktop",
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(topbarMock.openFolder).toHaveBeenCalledWith("/projects/dsh-desktop"),
    );
  });

  test("会话未绑定工作区时只显示任务标题", () => {
    topbarMock.threadId = "t-loose";
    renderTopbar();

    expect(screen.queryByText("DSH-Desktop")).toBeNull();
    expect(screen.getByText("全面分析这个项目")).toBeTruthy();
  });

  test("非会话页（无 threadId）不显示工作区前缀", () => {
    topbarMock.threadId = null;
    renderTopbar();

    expect(screen.queryByText("DSH-Desktop")).toBeNull();
  });
});
