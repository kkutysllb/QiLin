import { afterEach, describe, expect, test, vi } from "vitest";

import { listDir, readFile, writeFile } from "@/core/files/api";

afterEach(() => vi.restoreAllMocks());

describe("files api", () => {
  test("listDir GET /api/files/list", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ entries: [], parent: null }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await listDir("thr", "");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/files/list?thread_id=thr"),
      expect.any(Object),
    );
  });

  test("writeFile throws on 400 with error.code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: { code: "parent_not_found", message: "x" } }),
    }));
    await expect(() => writeFile("thr", "missing/x.txt", "x")).rejects.toMatchObject({ code: "parent_not_found" });
  });
});
