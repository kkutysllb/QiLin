// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/core/persistence/api", () => ({
  loadPersistenceUsage: vi.fn(),
}));
vi.mock("@/core/desktop", () => ({
  openFolder: vi.fn(),
}));

import { loadPersistenceUsage } from "@/core/persistence/api";
import { openFolder } from "@/core/desktop";
import { DataDirectoryTable } from "@/components/workspace/settings/data-directory-table";

function withClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("DataDirectoryTable", () => {
  beforeEach(() => vi.clearAllMocks());

  test("renders directory rows and total", async () => {
    vi.mocked(loadPersistenceUsage).mockResolvedValue({
      directories: [
        { path: "/tmp/data", label: "SQLite 数据库", size_bytes: 1024 },
        { path: "/tmp/logs", label: "日志", size_bytes: 2048 },
      ],
      total_size_bytes: 3072,
    });
    withClient(<DataDirectoryTable />);
    expect(await screen.findByText("SQLite 数据库")).toBeTruthy();
    expect(screen.getByText(/3\.0 KB/)).toBeTruthy();
  });

  test("open button calls openFolder with the row path", async () => {
    vi.mocked(loadPersistenceUsage).mockResolvedValue({
      directories: [{ path: "/tmp/data", label: "data", size_bytes: 100 }],
      total_size_bytes: 100,
    });
    withClient(<DataDirectoryTable />);
    const btn = await screen.findByRole("button", { name: /打开/ });
    btn.click();
    await waitFor(() => {
      expect(openFolder).toHaveBeenCalledWith("/tmp/data");
    });
  });
});
