// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/core/persistence/api", () => ({
  loadPersistenceStatus: vi.fn(),
}));

import { loadPersistenceStatus } from "@/core/persistence/api";
import { PersistenceStatusDashboard } from "@/components/workspace/settings/persistence-status-dashboard";
import type { PersistenceStatusResponse } from "@/core/persistence/types";

const sample: PersistenceStatusResponse = {
  database: {
    backend: "sqlite",
    persisted: true,
    sqlite_dir: "/tmp/data",
    thread_count: 3,
    checkpoint_count: 90,
    run_count: 3,
    db_size_bytes: 950272,
  },
  run_events: {
    backend: "memory",
    persisted: false,
    event_count: 0,
    hint: "运行事件未持久化，重启后历史 trace 丢失",
  },
  memory: { enabled: true, persisted: true, memory_file: "/tmp/m.json", file_size_bytes: 2048 },
  sandbox_data: { threads_root: "/tmp/threads", total_size_bytes: 4096, thread_dir_count: 3 },
};

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("PersistenceStatusDashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders four status cards with backend labels and persisted state", async () => {
    vi.mocked(loadPersistenceStatus).mockResolvedValue(sample);
    withClient(<PersistenceStatusDashboard />);
    expect(await screen.findByText("SQLite")).toBeTruthy();
    // database + memory are both persisted in the sample, so "已持久化" appears
    // on multiple cards — use getAllByText to tolerate that.
    expect(screen.getAllByText("已持久化").length).toBeGreaterThan(0);
    expect(screen.getAllByText("未持久化").length).toBeGreaterThan(0);
    expect(screen.getByText(/运行事件未持久化/)).toBeTruthy();
  });

  test("renders error message on failure", async () => {
    vi.mocked(loadPersistenceStatus).mockRejectedValue(new Error("boom"));
    withClient(<PersistenceStatusDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/持久化状态加载失败/)).toBeTruthy();
    });
  });
});
