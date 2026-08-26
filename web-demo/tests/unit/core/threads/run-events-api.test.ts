import { afterEach, describe, expect, test, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("@/core/api/fetcher", () => ({
  fetch: fetchMock,
}));

vi.mock("@/core/config", () => ({
  getBackendBaseURL: () => "",
}));

import { fetchTaskEvents } from "@/core/threads/run-events-api";

describe("fetchTaskEvents", () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  test("calls the correct URL and returns parsed events", async () => {
    const events = [
      {
        event_type: "subagent.start",
        content: { task_id: "t1", description: "Research" },
        metadata: { task_id: "t1" },
      },
      {
        event_type: "subagent.end",
        content: { task_id: "t1", status: "completed" },
        metadata: { task_id: "t1" },
      },
    ];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(events), { status: 200 }),
    );

    const result = await fetchTaskEvents("thread-1", "run-1", "t1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/threads/thread-1/runs/run-1/events?task_id=t1",
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.event_type).toBe("subagent.start");
    expect(result[1]?.event_type).toBe("subagent.end");
  });

  test("throws on non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Not found", { status: 404 }),
    );

    await expect(fetchTaskEvents("t", "r", "x")).rejects.toThrow(
      "Failed to fetch task events",
    );
  });

  test("returns empty array when backend has no events", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("[]", { status: 200 }),
    );

    const result = await fetchTaskEvents("t", "r", "x");
    expect(result).toEqual([]);
  });
});
