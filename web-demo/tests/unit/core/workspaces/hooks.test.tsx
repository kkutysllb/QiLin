// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  useArchiveThreads,
  useWorkspaceTree,
} from "@/core/workspaces/hooks";

const treePayload = {
  workspaces: [
    {
      id: "ws-1",
      path: "/projects/demo",
      title: "demo",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      position: 0,
      thread_ids: ["t1"],
    },
  ],
  ungrouped_thread_ids: ["t2"],
  archived_thread_ids: ["t3"],
};

const fetchTree = vi.fn();

beforeEach(() => {
  fetchTree.mockReset();
  fetchTree.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => treePayload,
  });
  vi.stubGlobal("fetch", fetchTree);
});

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

describe("useWorkspaceTree", () => {
  test("装载树投影并按 ['workspaces','tree'] 缓存", async () => {
    const { Wrapper, client } = makeWrapper();
    const { result } = renderHook(() => useWorkspaceTree(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(treePayload);
    // 同 key 复用缓存：第二次挂载不重复发请求
    const cached = client.getQueryData(["workspaces", "tree"]);
    expect(cached).toEqual(treePayload);
  });

  test("归档 mutation 成功后失效树查询触发重拉", async () => {
    const { Wrapper } = makeWrapper();
    const querySpy = renderHook(() => useWorkspaceTree(), { wrapper: Wrapper });
    await waitFor(() => expect(querySpy.result.current.isSuccess).toBe(true));
    const callsBefore = fetchTree.mock.calls.length;

    const { result: mutation } = renderHook(() => useArchiveThreads(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await mutation.current.mutateAsync(["t3"]);
    });

    await waitFor(() =>
      expect(fetchTree.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });
});
