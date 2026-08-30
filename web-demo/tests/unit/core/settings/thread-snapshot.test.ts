// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";

import {
  DEFAULT_LOCAL_SETTINGS,
  DEFAULT_SENTINEL,
  THREAD_AGENT_KEY_PREFIX,
  THREAD_MODEL_KEY_PREFIX,
  THREAD_WORKSPACE_PATH_KEY_PREFIX,
  applyThreadAgentOverride,
  applyThreadModelOverride,
  getThreadAgentName,
  getThreadModelName,
  getThreadWorkspaceId,
  getThreadWorkspacePath,
  saveThreadAgentName,
  saveThreadModelName,
  saveThreadWorkspaceId,
  saveThreadWorkspacePath,
} from "@/core/settings/local";
import {
  getThreadAgentSnapshot,
  getThreadModelSnapshot,
  getThreadWorkspaceIdSnapshot,
  hasThreadAgentOverride,
  hasThreadWorkspaceIdOverride,
  updateThreadSettings,
} from "@/core/settings/store";

// 表征测试：锚定 per-thread 快照样板（local.ts 存取 + store.ts 快照）的
// 现状语义，供工厂化重构后零改动回归。每个用例使用独立 threadId，避免
// store 模块级缓存跨用例串扰。
beforeEach(() => {
  localStorage.clear();
});

describe("core/settings per-thread 快照字段（表征）", () => {
  test("model 字段：存/取/清空（无 sentinel，falsy 保存即移除 key）", () => {
    saveThreadModelName("t-model", "glm-5");
    expect(localStorage.getItem(`${THREAD_MODEL_KEY_PREFIX}t-model`)).toBe(
      "glm-5",
    );
    expect(getThreadModelName("t-model")).toBe("glm-5");

    // 空串按 falsy 处理：移除 key（区别于 sentinel 型字段的显式默认语义）
    saveThreadModelName("t-model", "");
    expect(localStorage.getItem(`${THREAD_MODEL_KEY_PREFIX}t-model`)).toBeNull();
    expect(getThreadModelName("t-model")).toBeUndefined();

    saveThreadModelName("t-model", "glm-5");
    saveThreadModelName("t-model", undefined);
    expect(localStorage.getItem(`${THREAD_MODEL_KEY_PREFIX}t-model`)).toBeNull();
    expect(getThreadModelName("t-model")).toBeUndefined();
  });

  test("agent 字段：__default__ sentinel 三态（null / sentinel / 原值）", () => {
    // 从未存储 → 回落全局设置
    expect(getThreadAgentName("t-agent")).toBeUndefined();

    // 显式恢复默认 → 写入 sentinel，读取回退 undefined
    saveThreadAgentName("t-agent", undefined);
    expect(localStorage.getItem(`${THREAD_AGENT_KEY_PREFIX}t-agent`)).toBe(
      DEFAULT_SENTINEL,
    );
    expect(getThreadAgentName("t-agent")).toBeUndefined();

    // 显式选择 agent → 原值透传
    saveThreadAgentName("t-agent", "alice");
    expect(localStorage.getItem(`${THREAD_AGENT_KEY_PREFIX}t-agent`)).toBe(
      "alice",
    );
    expect(getThreadAgentName("t-agent")).toBe("alice");
  });

  test("workspace-path/id 字段：空串 sentinel 的显式默认语义", () => {
    saveThreadWorkspacePath("t-ws", undefined);
    expect(
      localStorage.getItem(`${THREAD_WORKSPACE_PATH_KEY_PREFIX}t-ws`),
    ).toBe("");
    expect(getThreadWorkspacePath("t-ws")).toBeUndefined();

    saveThreadWorkspacePath("t-ws", "/projects/qilin");
    expect(getThreadWorkspacePath("t-ws")).toBe("/projects/qilin");

    saveThreadWorkspaceId("t-ws", undefined);
    expect(getThreadWorkspaceId("t-ws")).toBeUndefined();
    saveThreadWorkspaceId("t-ws", "ws-9");
    expect(getThreadWorkspaceId("t-ws")).toBe("ws-9");
  });

  test("store 快照：updateThreadSettings 写穿、hasOwnProperty 显式覆盖、apply 语义", () => {
    updateThreadSettings("t-store", "context", {
      agent_name: "bob",
      model_name: "glm-5",
      workspace_id: "ws-9",
    });
    expect(getThreadAgentSnapshot("t-store")).toBe("bob");
    expect(hasThreadAgentOverride("t-store")).toBe(true);
    expect(getThreadModelSnapshot("t-store")).toBe("glm-5");
    expect(getThreadWorkspaceIdSnapshot("t-store")).toBe("ws-9");
    expect(hasThreadWorkspaceIdOverride("t-store")).toBe(true);

    // hasOwnProperty 语义：显式 undefined 也算一次覆盖——快照变 undefined
    // 但 override 保持，且 localStorage 落 sentinel。
    updateThreadSettings("t-store", "context", { agent_name: undefined });
    expect(getThreadAgentSnapshot("t-store")).toBeUndefined();
    expect(hasThreadAgentOverride("t-store")).toBe(true);
    expect(localStorage.getItem(`${THREAD_AGENT_KEY_PREFIX}t-store`)).toBe(
      DEFAULT_SENTINEL,
    );

    // apply 语义：有 override 时即使 undefined 也写穿 context（显式默认）；
    // 无 override 时不碰 context；model 无 override 概念，falsy 直接短路。
    const base: typeof DEFAULT_LOCAL_SETTINGS = {
      ...DEFAULT_LOCAL_SETTINGS,
      context: { ...DEFAULT_LOCAL_SETTINGS.context },
    };
    const applied = applyThreadAgentOverride(base, undefined, true);
    expect(applied.context.agent_name).toBeUndefined();
    expect("agent_name" in applied.context).toBe(true);
    expect(applyThreadAgentOverride(base, "alice", false).context.agent_name)
      .toBeUndefined();
    expect(applyThreadModelOverride(base, "glm-5").context.model_name).toBe(
      "glm-5",
    );
    expect(
      applyThreadModelOverride(base, undefined).context.model_name,
    ).toBeUndefined();
  });

  test("storage 广播 key=null：store 全量缓存清空并回落 localStorage 现状", () => {
    updateThreadSettings("t-clear", "context", { agent_name: "bob" });
    expect(hasThreadAgentOverride("t-clear")).toBe(true);

    // 模拟另一标签页清空该 thread 的 key 后广播 storage 事件
    localStorage.removeItem(`${THREAD_AGENT_KEY_PREFIX}t-clear`);
    window.dispatchEvent(new StorageEvent("storage", { key: null }));

    // 缓存已被清空 → 重新读 localStorage（raw null）→ 无覆写
    expect(hasThreadAgentOverride("t-clear")).toBe(false);
    expect(getThreadAgentSnapshot("t-clear")).toBeUndefined();
  });
});
