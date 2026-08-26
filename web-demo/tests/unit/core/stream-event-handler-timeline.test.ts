/**
 * Unit tests for the new timeline-related event types added to
 * handleStreamEvent: task_started and task_completed.
 */

import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { toastCallable, toastSpies } = vi.hoisted(() => ({
  toastCallable: vi.fn(),
  toastSpies: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import {
  handleStreamEvent,
  type StreamEventDependencies,
} from "@/core/threads/stream-event-handler";

vi.mock("sonner", () => ({
  toast: Object.assign(toastCallable, toastSpies),
}));

function makeDeps(
  overrides: Partial<StreamEventDependencies> = {},
): StreamEventDependencies & {
  updateSubtask: ReturnType<typeof vi.fn>;
} {
  return {
    updateSubtask: vi.fn(),
    ...overrides,
  } as StreamEventDependencies & {
    updateSubtask: ReturnType<typeof vi.fn>;
  };
}

describe("handleStreamEvent — timeline events", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("task_started", () => {
    test("marks subtask as in_progress and records start time", () => {
      handleStreamEvent(
        { type: "task_started", task_id: "t-start", description: "Research task" },
        deps,
      );

      expect(deps.updateSubtask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "t-start",
          status: "in_progress",
        }),
      );
      // The started_at should be a valid ISO string
      const call = deps.updateSubtask.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call.started_at).toBeTruthy();
      expect(typeof call.started_at).toBe("string");
      expect(() => new Date(call.started_at as string)).not.toThrow();
    });
  });

  describe("task_completed", () => {
    test("marks subtask completed and records model/usage", () => {
      const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
      handleStreamEvent(
        {
          type: "task_completed",
          task_id: "t-done",
          result: "Found 3 results",
          model_name: "gpt-4o",
          usage,
        },
        deps,
      );

      expect(deps.updateSubtask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "t-done",
          status: "completed",
          result: "Found 3 results",
          model_name: "gpt-4o",
          token_usage: usage,
        }),
      );
      const call = deps.updateSubtask.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call.completed_at).toBeTruthy();
    });

    test("works without optional fields", () => {
      handleStreamEvent(
        { type: "task_completed", task_id: "t-simple" },
        deps,
      );

      expect(deps.updateSubtask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "t-simple",
          status: "completed",
        }),
      );
    });
  });

  describe("task_failed with timeline data", () => {
    test("updates subtask with error, model, and usage", () => {
      const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
      handleStreamEvent(
        {
          type: "task_failed",
          task_id: "t-fail",
          error: "OOM",
          model_name: "claude-3",
          usage,
        },
        deps,
      );

      expect(deps.updateSubtask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "t-fail",
          status: "failed",
          error: "OOM",
          model_name: "claude-3",
          token_usage: usage,
        }),
      );
      expect(toastSpies.error).toHaveBeenCalledTimes(1);
    });
  });
});
