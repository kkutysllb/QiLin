// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";

/**
 * Node v25 ships a global `localStorage` that shadows happy-dom's and is not
 * method-functional in this env. Install an in-memory Storage shim on the
 * global so the store reads/writes against a working implementation.
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

import {
  enqueue,
  remove,
  updateStatus,
  editContent,
  reorder,
  getSendable,
  getInjecting,
  loadFromStorage,
  clearStorage,
} from "@/core/threads/queue-store";

const THREAD_ID = "t_test";

beforeEach(() => {
  localStorage.clear();
  clearStorage(THREAD_ID);
});

describe("queue-store", () => {
  it("enqueue adds a pending message with id and queuedAt", () => {
    const msg = enqueue(THREAD_ID, "hello", undefined);
    expect(msg.id).toBeTruthy();
    expect(msg.threadId).toBe(THREAD_ID);
    expect(msg.content).toBe("hello");
    expect(msg.status).toBe("pending");
    expect(msg.queuedAt).toBeGreaterThan(0);
  });

  it("remove deletes a message by id", () => {
    const m = enqueue(THREAD_ID, "x", undefined);
    remove(THREAD_ID, m.id);
    expect(getSendable(THREAD_ID)).toHaveLength(0);
  });

  it("updateStatus transitions status", () => {
    const m = enqueue(THREAD_ID, "x", undefined);
    updateStatus(THREAD_ID, m.id, "injecting");
    expect(getSendable(THREAD_ID)).toHaveLength(0);
    expect(getInjecting(THREAD_ID)).toHaveLength(1);
    updateStatus(THREAD_ID, m.id, "pending");
    expect(getSendable(THREAD_ID)).toHaveLength(1);
  });

  it("getSendable returns only pending, sorted by queuedAt asc", () => {
    const m1 = enqueue(THREAD_ID, "first", undefined);
    const m2 = enqueue(THREAD_ID, "second", undefined);
    updateStatus(THREAD_ID, m2.id, "injected");
    const sendable = getSendable(THREAD_ID);
    expect(sendable).toHaveLength(1);
    expect(sendable[0]!.id).toBe(m1.id);
  });

  it("reorder moves a message up changing send order", () => {
    const m1 = enqueue(THREAD_ID, "first", undefined);
    const m2 = enqueue(THREAD_ID, "second", undefined);
    reorder(THREAD_ID, m2.id, "up");
    const sendable = getSendable(THREAD_ID);
    expect(sendable[0]!.id).toBe(m2.id);
    expect(sendable[1]!.id).toBe(m1.id);
  });

  it("enqueue respects max 20 limit", () => {
    for (let i = 0; i < 20; i++) enqueue(THREAD_ID, `m${i}`, undefined);
    expect(() => enqueue(THREAD_ID, "overflow", undefined)).toThrow(/队列已满/);
  });

  it("persists pending messages to localStorage", () => {
    enqueue(THREAD_ID, "persisted", undefined);
    const stored = localStorage.getItem("kworks.queuedMsgs." + THREAD_ID);
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.messages[0].content).toBe("persisted");
    expect(parsed.messages[0].status).toBe("pending");
  });

  it("loadFromStorage drops injected messages", () => {
    const m = enqueue(THREAD_ID, "injected-one", undefined);
    updateStatus(THREAD_ID, m.id, "injected");
    const loaded = loadFromStorage(THREAD_ID);
    expect(loaded?.messages ?? []).toHaveLength(0);
  });

  it("loadFromStorage downgrades injecting/sending/error to pending", () => {
    const m1 = enqueue(THREAD_ID, "injecting-one", undefined);
    updateStatus(THREAD_ID, m1.id, "injecting");
    const m2 = enqueue(THREAD_ID, "error-one", undefined);
    updateStatus(THREAD_ID, m2.id, "error", "boom");
    const loaded = loadFromStorage(THREAD_ID);
    expect(loaded?.messages).toHaveLength(2);
    expect(loaded!.messages.every((m) => m.status === "pending")).toBe(true);
    expect(loaded!.messages.every((m) => m.error === undefined)).toBe(true);
  });

  it("loadFromStorage handles corrupt JSON gracefully", () => {
    localStorage.setItem("kworks.queuedMsgs." + THREAD_ID, "{not json");
    const loaded = loadFromStorage(THREAD_ID);
    expect(loaded).toBeNull();
  });

  it("editContent updates content without changing status", () => {
    const m = enqueue(THREAD_ID, "original", undefined);
    editContent(THREAD_ID, m.id, "edited");
    const sendable = getSendable(THREAD_ID);
    expect(sendable[0]!.content).toBe("edited");
    expect(sendable[0]!.status).toBe("pending");
  });
});
