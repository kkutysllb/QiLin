// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { useWorkspaceParamPreset } from "@/core/workspaces/use-workspace-param";

const WORKSPACES = [
  { id: "ws-a", path: "/projects/a" },
  { id: "ws-b", path: "/projects/b" },
  { id: "ws-d", path: "/projects/d" },
] as const;

function renderPreset(overrides?: {
  workspaceParam?: string | null;
  isNewThread?: boolean;
  threadId?: string;
  workspaces?: readonly { id: string; path: string }[];
}) {
  const onApply = vi.fn();
  const latest = {
    workspaceParam: overrides?.workspaceParam ?? null,
    isNewThread: overrides?.isNewThread ?? true,
    threadId: overrides?.threadId ?? "thread-1",
    workspaces: overrides?.workspaces ?? WORKSPACES,
  };
  const hook = renderHook(
    (props: typeof latest) => useWorkspaceParamPreset({ ...props, onApply }),
    { initialProps: latest },
  );
  const rerenderWith = (next: Partial<typeof latest>) => {
    Object.assign(latest, next);
    act(() => hook.rerender({ ...latest }));
  };
  return { onApply, rerenderWith };
}

describe("useWorkspaceParamPreset", () => {
  test("URL 参数覆盖全局遗留的上一个任务工作区", () => {
    // 场景：baseSettings 记录的上一个任务工作区是 ws-a（遗留值），
    // 用户在工作区 B 组头点「+ 新会话」→ /workspace/chats/new?workspace=ws-b。
    const { onApply } = renderPreset({ workspaceParam: "ws-b" });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      workspace_id: "ws-b",
      user_workspace_path: "/projects/b",
    });
  });

  test("同一草稿内参数只生效一次：手动切换工作区不被回抢", () => {
    const { onApply, rerenderWith } = renderPreset({
      workspaceParam: "ws-b",
    });
    expect(onApply).toHaveBeenCalledTimes(1);

    // 用户在草稿态手动把工作区切到 ws-a（rerender 模拟 context 变化引发的渲染）
    rerenderWith({});
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  test("参数变化（点另一个工作区的 +）再次生效并覆盖当前选择", () => {
    const { onApply, rerenderWith } = renderPreset({
      workspaceParam: "ws-b",
    });
    expect(onApply).toHaveBeenCalledWith({
      workspace_id: "ws-b",
      user_workspace_path: "/projects/b",
    });

    rerenderWith({ workspaceParam: "ws-d" });
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(onApply).toHaveBeenLastCalledWith({
      workspace_id: "ws-d",
      user_workspace_path: "/projects/d",
    });
  });

  test("新草稿（threadId 变化）相同参数再次生效", () => {
    const { onApply, rerenderWith } = renderPreset({
      workspaceParam: "ws-b",
      threadId: "thread-1",
    });
    expect(onApply).toHaveBeenCalledTimes(1);

    // 再次点「+ 新会话」：useThreadChat 为新草稿生成全新 threadId
    rerenderWith({ threadId: "thread-2" });
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(onApply).toHaveBeenLastCalledWith({
      workspace_id: "ws-b",
      user_workspace_path: "/projects/b",
    });
  });

  test("工作区列表未加载时不消费参数，加载完成后生效", () => {
    const { onApply, rerenderWith } = renderPreset({
      workspaceParam: "ws-b",
      workspaces: [],
    });
    expect(onApply).not.toHaveBeenCalled();

    rerenderWith({ workspaces: [...WORKSPACES] });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      workspace_id: "ws-b",
      user_workspace_path: "/projects/b",
    });
  });

  test("非新会话草稿不生效", () => {
    const { onApply } = renderPreset({
      workspaceParam: "ws-b",
      isNewThread: false,
    });
    expect(onApply).not.toHaveBeenCalled();
  });

  test("无 URL 参数不生效", () => {
    const { onApply } = renderPreset({ workspaceParam: null });
    expect(onApply).not.toHaveBeenCalled();
  });

  test("参数指向未知工作区时不消费，列表补上后生效", () => {
    const { onApply, rerenderWith } = renderPreset({
      workspaceParam: "ws-new",
      workspaces: [{ id: "ws-a", path: "/projects/a" }],
    });
    expect(onApply).not.toHaveBeenCalled();

    rerenderWith({
      workspaces: [{ id: "ws-new", path: "/projects/new" }],
    });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      workspace_id: "ws-new",
      user_workspace_path: "/projects/new",
    });
  });
});
