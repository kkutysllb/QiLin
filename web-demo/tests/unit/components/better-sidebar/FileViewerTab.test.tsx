// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FileViewerTab } from "@/components/better-sidebar/panels/FileViewerTab";
import { fileViewerRegistry } from "@/core/sidebar/viewer-registry";
import { registerBuiltinViewers } from "@/core/sidebar/viewer-host";

vi.mock("@/core/files/api", () => ({
  readFile: vi.fn().mockResolvedValue("# hi"),
}));

const unregisters: Array<() => void> = [];
beforeEach(() => {
  // Built-in viewer registration is app-level wiring; unit tests
  // register on demand because dispatch goes through the global singleton.
  // registerBuiltinViewers() now returns one disposer per registration
  // (file-viewer + sidebar-panel entries), so flatten before pushing.
  unregisters.push(...registerBuiltinViewers());
});
afterEach(() => {
  while (unregisters.length) unregisters.pop()?.();
  fileViewerRegistry.list().forEach((v) => fileViewerRegistry.unregister(v.id));
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe("FileViewerTab", () => {
  test("renders markdown viewer for .md file", async () => {
    render(
      <FileViewerTab
        scope={{ threadId: "thr" }}
        payload={{ path: "README.md" }}
        onPayloadChange={() => {}}
        api={{ openTab: () => {}, closeSelf: () => {}, toast: () => {} }}
      />,
      { wrapper },
    );
    await waitFor(() => screen.getByRole("heading", { level: 1 }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("hi");
  });
});
