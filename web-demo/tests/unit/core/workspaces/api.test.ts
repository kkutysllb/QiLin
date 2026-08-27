import { afterEach, describe, expect, test, vi } from "vitest";

import {
  WorkspaceApiError,
  archiveThreads,
  attachThread,
  createWorkspace,
  deleteWorkspace,
  detachThread,
  getWorkspaceTree,
  getWorkspaces,
  reorderThread,
  renameWorkspace,
  unarchiveThreads,
} from "@/core/workspaces/api";

afterEach(() => vi.unstubAllGlobals());

describe("workspaces api", () => {
  test("getWorkspaceTree 走 GET /api/workspaces/tree 并带回凭据", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ workspaces: [], ungrouped_thread_ids: [], archived_thread_ids: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await getWorkspaceTree();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspaces/tree",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  test("createWorkspace POST JSON 体含 realpath 输入", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "ws-1", canonical_path: "/p", title: "", created_at: "", updated_at: "", position: null, session_ids: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await createWorkspace("/p", "demo");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/workspaces");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ path: "/p", title: "demo" });
  });

  test("解析 detail 对象稳定码为 WorkspaceApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: { code: "WORKSPACE_NOT_FOUND", message: "no row" } }),
    }));
    const err = await getWorkspaces().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WorkspaceApiError);
    expect(err).toMatchObject({ code: "WORKSPACE_NOT_FOUND", status: 404, message: "no row" });
  });

  test("字符串 detail 与非 JSON 响应都归一为错误对象", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "workspace_not_found" }),
    }));
    await expect(renameWorkspace("w1", "x")).rejects.toMatchObject({
      code: "unknown",
      message: "workspace_not_found",
      status: 400,
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("not json");
      },
    }));
    await expect(attachThread("w1", "t1")).rejects.toMatchObject({ code: "unknown", status: 503 });
  });

  test("archive 用 PUT、unarchive 用 DELETE 且都带 thread_ids 体", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);
    await archiveThreads(["a"]);
    await unarchiveThreads(["a"]);
    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/workspaces/archive",
      expect.objectContaining({ method: "PUT" }),
    ]);
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/workspaces/archive",
      expect.objectContaining({ method: "DELETE" }),
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      thread_ids: ["a"],
    });
  });

  test("detach 走 DELETE、线程重排序走 POST 且 before_thread_id 可空", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await detachThread("w1", "t1");
    await reorderThread("w1", "t2", null);
    const detach = fetchMock.mock.calls[0] as [string, RequestInit];
    const reorder = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(detach[0]).toBe("/api/workspaces/w1/threads/t1");
    expect(detach[1].method).toBe("DELETE");
    expect(reorder[0]).toBe("/api/workspaces/w1/threads/t2/reorder");
    expect(JSON.parse(reorder[1].body as string)).toEqual({ before_thread_id: null });
  });

  test("deleteWorkspace 走 DELETE /api/workspaces/{id}（无体）", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await deleteWorkspace("w9");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/workspaces/w9");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });
});
