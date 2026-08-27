// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useWorkspaceViewCollapse } from "@/core/workspaces/view-state";

const KEY = "kworks.workspace.collapsedGroups";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useWorkspaceViewCollapse", () => {
  it("切换折叠并在 localStorage 持久化（collapsed-set 方向）", () => {
    const { result } = renderHook(() => useWorkspaceViewCollapse());
    expect(result.current.isCollapsed("ws-1")).toBe(false);

    act(() => result.current.toggleCollapse("ws-1"));
    expect(result.current.isCollapsed("ws-1")).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem(KEY) ?? "[]"),
    ).toContain("ws-1");

    // 重复 toggle 回到展开态
    act(() => result.current.toggleCollapse("ws-1"));
    expect(result.current.isCollapsed("ws-1")).toBe(false);
    expect(
      JSON.parse(window.localStorage.getItem(KEY) ?? "[]"),
    ).not.toContain("ws-1");
  });

  it("retainKeys 清理已删除工作区的残留记忆", () => {
    localStorage.setItem(KEY, JSON.stringify(["ws-gone", "ws-keep"]));
    const { result } = renderHook(() => useWorkspaceViewCollapse());
    act(() => result.current.retainKeys(new Set(["ws-keep"])));
    expect(result.current.isCollapsed("ws-gone")).toBe(false);
    expect(result.current.isCollapsed("ws-keep")).toBe(true);
  });

  it("存储抛异常时静默退化为内存态", () => {
    // 整体替换 window.localStorage 描述符（原型/实例方法隔离在各实现间不可靠），
    // finally 里还原原描述符，保证对后续用例零泄漏。
    const win = globalThis as { localStorage?: Storage };
    const descriptor = Object.getOwnPropertyDescriptor(win, "localStorage");
    const failing: Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear"> = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => undefined,
      clear: () => undefined,
    };
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => failing,
    });
    try {
      const { result } = renderHook(() =>
        useWorkspaceViewCollapse(),
      );
      act(() => result.current.toggleCollapse("ws-1"));
      expect(result.current.isCollapsed("ws-1")).toBe(true);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "localStorage", descriptor);
      }
    }
  });

  it("损坏的持久化载荷被忽略", () => {
    localStorage.setItem(KEY, "{broken");
    const { result } = renderHook(() => useWorkspaceViewCollapse());
    expect(result.current.isCollapsed("anything")).toBe(false);
  });
});
