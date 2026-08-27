// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { FileExplorerPanel } from "@/components/better-sidebar/panels/FileExplorer";
import { SidebarScopeProvider } from "@/core/sidebar/scope";

vi.mock("@/core/files/api", () => ({
  listDir: vi.fn().mockResolvedValue({
    entries: [
      { name: "README.md", type: "file", size: 0, mtime: 0, mime: "text/markdown" },
      { name: "src", type: "dir", size: 0, mtime: 0, mime: null },
    ],
    parent: null,
  }),
}));

const noopApi = {
  openTab: () => undefined,
  closeSelf: () => undefined,
  toast: () => undefined,
};
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SidebarScopeProvider scope={{ threadId: "thr" }} api={noopApi}>
      {children}
    </SidebarScopeProvider>
  </QueryClientProvider>
);

describe("FileExplorerPanel", () => {
  test("lists root entries and toggles a directory open", async () => {
    render(<FileExplorerPanel scope={{ threadId: "thr" }} root="" />, { wrapper });
    await waitFor(() => screen.getByText("README.md"));
    expect(screen.getByText("src")).toBeTruthy();
  });
});
