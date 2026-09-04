// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { useWorkspaceDraftReset } from "@/core/workspaces/use-workspace-draft-reset";

type DraftState = {
  isNewThread: boolean;
  hasWorkspaceParam: boolean;
  workspaceId: string | undefined;
  workspacePath: string | undefined;
  /** 该草稿是否已有线程级 context 覆盖（用户选择或 reset 写入的显式空）。 */
  hasOverride?: boolean;
};

function renderReset(initial: DraftState) {
  const onReset = vi.fn();
  const hook = renderHook(
    (props: DraftState) =>
      useWorkspaceDraftReset({ hasOverride: false, ...props, onReset }),
    { initialProps: initial },
  );
  const rerenderWith = (next: Partial<DraftState>) => {
    act(() => hook.rerender({ ...initial, ...next }));
  };
  return { onReset, rerenderWith };
}

describe("useWorkspaceDraftReset", () => {
  test("全局新任务草稿清除遗留的工作区选择", () => {
    // 场景：全局「新任务」入口（无 ?workspace=），baseSettings 还留着
    // 上一个任务的工作区 ws-a → 草稿应回到未选择状态。
    const { onReset } = renderReset({
      isNewThread: true,
      hasWorkspaceParam: false,
      workspaceId: "ws-a",
      workspacePath: "/projects/a",
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  test("显式 ?workspace= 时不重置（由参数预设 hook 负责）", () => {
    const { onReset } = renderReset({
      isNewThread: true,
      hasWorkspaceParam: true,
      workspaceId: "ws-a",
      workspacePath: "/projects/a",
    });
    expect(onReset).not.toHaveBeenCalled();
  });

  test("非草稿态（已存在的任务）不重置", () => {
    const { onReset } = renderReset({
      isNewThread: false,
      hasWorkspaceParam: false,
      workspaceId: "ws-a",
      workspacePath: "/projects/a",
    });
    expect(onReset).not.toHaveBeenCalled();
  });

  test("草稿本就未选择时不产生多余写入", () => {
    const { onReset } = renderReset({
      isNewThread: true,
      hasWorkspaceParam: false,
      workspaceId: undefined,
      workspacePath: undefined,
    });
    expect(onReset).not.toHaveBeenCalled();
  });

  test("仅 user_workspace_path 有值时同样重置", () => {
    const { onReset } = renderReset({
      isNewThread: true,
      hasWorkspaceParam: false,
      workspaceId: undefined,
      workspacePath: "/projects/a",
    });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  test("清空后不重复触发", () => {
    const { onReset, rerenderWith } = renderReset({
      isNewThread: true,
      hasWorkspaceParam: false,
      workspaceId: "ws-a",
      workspacePath: "/projects/a",
    });
    expect(onReset).toHaveBeenCalledTimes(1);

    // 模拟 onReset 生效后的重渲染（选择已为空）
    rerenderWith({ workspaceId: undefined, workspacePath: undefined });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  test("草稿期间外部写入的新遗留会再次被清除", () => {
    const { onReset, rerenderWith } = renderReset({
      isNewThread: true,
      hasWorkspaceParam: false,
      workspaceId: undefined,
      workspacePath: undefined,
    });
    expect(onReset).not.toHaveBeenCalled();

    // 模拟另一标签页写入全局记录后，同步进本草稿的回落值
    rerenderWith({ workspaceId: "ws-c", workspacePath: "/projects/c" });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  test("用户在草稿里主动选择的工作区不被清除（回归：新任务选工作区发送后 agent 看到空目录）", () => {
    // 场景：草稿挂载时全局回落值已被清（显式空覆盖已写入），用户随后在
    // 输入框工作区下拉里主动选了 ws-a。线程级覆盖已存在 → 不清。
    const { onReset, rerenderWith } = renderReset({
      isNewThread: true,
      hasWorkspaceParam: false,
      workspaceId: undefined,
      workspacePath: undefined,
    });
    expect(onReset).not.toHaveBeenCalled();

    // 用户选择：workspace_id 写入线程级覆盖，值变为 ws-a
    rerenderWith({
      hasOverride: true,
      workspaceId: "ws-a",
      workspacePath: "/projects/a",
    });
    expect(onReset).not.toHaveBeenCalled();
  });

  test("线程级覆盖已存在时不清除回落进来的同值/异值", () => {
    const { onReset } = renderReset({
      isNewThread: true,
      hasWorkspaceParam: false,
      workspaceId: "ws-a",
      workspacePath: "/projects/a",
      hasOverride: true,
    });
    expect(onReset).not.toHaveBeenCalled();
  });
});
