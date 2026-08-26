// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/core/api/fetcher", () => ({
  fetch: vi.fn(),
}));

import { fetch as mockFetch } from "@/core/api/fetcher";
import { loadPersistenceStatus, loadPersistenceUsage } from "@/core/persistence/api";
import type { PersistenceStatusResponse } from "@/core/persistence/types";

describe("persistence api", () => {
  afterEach(() => vi.clearAllMocks());

  test("loadPersistenceStatus calls /api/persistence/status", async () => {
    const mockResponse: PersistenceStatusResponse = {
      database: {
        backend: "sqlite",
        persisted: true,
        sqlite_dir: "/tmp/data",
        thread_count: 3,
        checkpoint_count: 90,
        run_count: 3,
        db_size_bytes: 950272,
      },
      run_events: { backend: "memory", persisted: false, event_count: 0, hint: "test hint" },
      memory: { enabled: true, persisted: true, memory_file: "/tmp/m.json", file_size_bytes: 100 },
      sandbox_data: { threads_root: "/tmp/threads", total_size_bytes: 200, thread_dir_count: 3 },
    };
    vi.mocked(mockFetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await loadPersistenceStatus();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/persistence/status"),
    );
    expect(result.database.backend).toBe("sqlite");
    expect(result.run_events.persisted).toBe(false);
  });

  test("loadPersistenceUsage calls /api/persistence/usage", async () => {
    vi.mocked(mockFetch).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          directories: [{ path: "/tmp/data", label: "data", size_bytes: 100 }],
          total_size_bytes: 100,
        }),
    } as Response);

    const result = await loadPersistenceUsage();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/persistence/usage"),
    );
    expect(result.directories).toHaveLength(1);
    expect(result.total_size_bytes).toBe(100);
  });

  test("loadPersistenceStatus throws on non-ok response", async () => {
    vi.mocked(mockFetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);

    await expect(loadPersistenceStatus()).rejects.toThrow();
  });
});
