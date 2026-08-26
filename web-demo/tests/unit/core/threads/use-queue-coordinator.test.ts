// @vitest-environment happy-dom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type * as InjectApiModule from "@/core/api/inject";
import * as injectApi from "@/core/api/inject";
import { clearStorage } from "@/core/threads/queue-store";
import * as queueStore from "@/core/threads/queue-store";
import { useQueueCoordinator } from "@/core/threads/use-queue-coordinator";

/**
 * Node v25 ships a global `localStorage` that shadows happy-dom's and is not
 * method-functional in this env. Install an in-memory Storage shim on the
 * global so the store reads/writes against a working implementation.
 * (Mirrors the shim used in queue-store.test.ts — Task 6 finding.)
 */
function installLocalStorageShim() {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: shim,
    configurable: true,
    writable: true,
  });
}

installLocalStorageShim();

// Mock only `injectMessage` (default no-op) while preserving the real
// `InjectError` class via importActual. This keeps `instanceof InjectError`
// identity intact in the hook so the 409-downgrade branch is reachable —
// a blanket `vi.mock("@/core/api/inject")` would replace InjectError with a
// mock constructor and break that branch. (vitest hoists vi.mock above the
// imports, so declaration order here is purely cosmetic.)
vi.mock("@/core/api/inject", async () => {
  const actual = await vi.importActual<typeof InjectApiModule>(
    "@/core/api/inject",
  );
  return { ...actual, injectMessage: vi.fn() };
});

const THREAD_ID = "t_coord";

beforeEach(() => {
  localStorage.clear();
  clearStorage(THREAD_ID);
  vi.clearAllMocks();
});

describe("useQueueCoordinator", () => {
  it("enqueue adds to store", () => {
    const { result } = renderHook(() =>
      useQueueCoordinator(THREAD_ID, { sendMessage: vi.fn() }, "run1"),
    );
    act(() => result.current.enqueue("hello"));
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]!.status).toBe("pending");
  });

  it("injectNow calls API and marks injected on success", async () => {
    vi.spyOn(injectApi, "injectMessage").mockResolvedValue({
      run_id: "run1",
      message_id: "",
      status: "accepted",
      note: "",
    });
    const { result } = renderHook(() =>
      useQueueCoordinator(THREAD_ID, { sendMessage: vi.fn() }, "run1"),
    );
    act(() => result.current.enqueue("inject me"));
    const msg = result.current.messages[0]!;
    await act(async () => {
      await result.current.injectNow(msg);
    });
    expect(injectApi.injectMessage).toHaveBeenCalledWith(
      THREAD_ID,
      "run1",
      expect.objectContaining({ content: "inject me" }),
    );
    expect(result.current.messages[0]!.status).toBe("injected");
  });

  it("injectNow on 409 run_not_active downgrades to pending", async () => {
    vi.spyOn(injectApi, "injectMessage").mockRejectedValue(
      new injectApi.InjectError("run_not_active", "ended", 409),
    );
    const { result } = renderHook(() =>
      useQueueCoordinator(THREAD_ID, { sendMessage: vi.fn() }, "run1"),
    );
    act(() => result.current.enqueue("x"));
    const msg = result.current.messages[0]!;
    await act(async () => {
      await result.current.injectNow(msg);
    });
    expect(result.current.messages[0]!.status).toBe("pending");
  });

  it("injectNow on other error marks error", async () => {
    vi.spyOn(injectApi, "injectMessage").mockRejectedValue(
      new injectApi.InjectError(undefined, "boom", 500),
    );
    const { result } = renderHook(() =>
      useQueueCoordinator(THREAD_ID, { sendMessage: vi.fn() }, "run1"),
    );
    act(() => result.current.enqueue("x"));
    const msg = result.current.messages[0]!;
    await act(async () => {
      await result.current.injectNow(msg);
    });
    expect(result.current.messages[0]!.status).toBe("error");
    expect(result.current.messages[0]!.error).toBeTruthy();
  });

  it("autoSendNext sends first pending and removes on success", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useQueueCoordinator(THREAD_ID, { sendMessage }, "run1"),
    );
    act(() => {
      result.current.enqueue("first");
      result.current.enqueue("second");
    });
    await act(async () => {
      await result.current.autoSendNext();
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("first", undefined);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]!.content).toBe("second");
  });

  it("autoSendNext with injecting items schedules retry (no immediate send)", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useQueueCoordinator(THREAD_ID, { sendMessage }, "run1"),
    );
    act(() => result.current.enqueue("x"));
    const msg = result.current.messages[0]!;
    act(() => queueStore.updateStatus(THREAD_ID, msg.id, "injecting"));
    await act(async () => {
      await result.current.autoSendNext();
    });
    // sendable is empty (the item is "injecting", not "pending") AND there's an
    // in-flight inject. autoSendNext must NOT send anything immediately; it
    // schedules a 500ms retry to give the inject time to resolve/downgrade.
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("manualSendAll sends all pending in sequence", async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useQueueCoordinator(THREAD_ID, { sendMessage }, "run1"),
    );
    act(() => {
      result.current.enqueue("a");
      result.current.enqueue("b");
      result.current.enqueue("c");
    });
    await act(async () => {
      await result.current.manualSendAll();
    });
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).toHaveBeenNthCalledWith(1, "a", undefined);
    expect(sendMessage).toHaveBeenNthCalledWith(2, "b", undefined);
    expect(sendMessage).toHaveBeenNthCalledWith(3, "c", undefined);
    expect(result.current.messages).toHaveLength(0);
  });

  it("manualSendAll stops on first failure", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("net"));
    const { result } = renderHook(() =>
      useQueueCoordinator(THREAD_ID, { sendMessage }, "run1"),
    );
    act(() => {
      result.current.enqueue("a");
      result.current.enqueue("b");
      result.current.enqueue("c");
    });
    await act(async () => {
      await result.current.manualSendAll();
    });
    expect(sendMessage).toHaveBeenCalledTimes(2); // a succeeded, b failed, c not attempted
    expect(result.current.messages).toHaveLength(2); // b (error) + c (pending)
  });

  it("autoSendNext retry eventually sends after injecting downgrades to pending", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useQueueCoordinator(THREAD_ID, { sendMessage }, "run1"),
    );
    // 入队一条，标记为 injecting（模拟 inject 正在进行）
    act(() => {
      result.current.enqueue("will-inject");
    });
    const msg = result.current.messages[0]!;
    act(() => queueStore.updateStatus(THREAD_ID, msg.id, "injecting"));

    // 第一次 autoSendNext：sendable 空（injecting 不算），调度重试
    await act(async () => {
      await result.current.autoSendNext();
    });
    expect(sendMessage).not.toHaveBeenCalled();

    // 模拟 inject 失败降级回 pending（竞态场景：run 已结束）
    act(() => queueStore.updateStatus(THREAD_ID, msg.id, "pending"));

    // 推进时间触发重试，并等待 promise 解析
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    // act 可能未等待宏任务内的 promise，补一次微任务刷新
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith("will-inject", undefined);
    vi.useRealTimers();
  });

  it("autoSendNext concurrent calls are guarded (second call no-ops)", async () => {
    // 用可控 promise：让第一个 sendMessage 挂起，直到我们手动 resolve。
    let resolveFirst!: () => void;
    const hangingPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const sendMessage = vi.fn().mockImplementation(() => hangingPromise);
    const { result } = renderHook(() =>
      useQueueCoordinator(THREAD_ID, { sendMessage }, "run1"),
    );
    act(() => result.current.enqueue("x"));

    // 第一个调用（挂起，因为 sendMessage 不 resolve）
    let p1!: Promise<void>;
    act(() => {
      p1 = result.current.autoSendNext();
    });
    // 第二个调用：第一个仍在飞（flag=true），应被 guard 拦截立即返回。
    await act(async () => {
      await result.current.autoSendNext();
    });
    expect(sendMessage).toHaveBeenCalledTimes(1); // 只被调一次

    // 清理：resolve 挂起的 promise，避免泄漏。
    await act(async () => {
      resolveFirst();
      await p1;
    });
  });
});
