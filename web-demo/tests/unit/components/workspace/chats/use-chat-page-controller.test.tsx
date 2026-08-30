// @vitest-environment happy-dom
/**
 * 双路由聊天页收敛（阶段5批2-M3）的表征测试。
 *
 * 锚定 useChatPageController 的关键行为差异，防止后续改动回归：
 * 1. agent_name 传递路径：context 注入 + 三条发送通路（submit / human-input /
 *    队列 autoSend）的 extraContext；
 * 2. 队列 handler 绑定：enqueue 落库 + toast、error 重试「降级 pending →
 *    autoSendNext → 发送移除」链路（真实 useQueueCoordinator）；
 * 3. URL 构造：onStart replaceState / 分支副本导航 / agent_name 编码差异；
 * 4. 草稿重置只在 workspace 页生效（含 ?workspace= 透传豁免）；
 * 5. 桌面通知：隐藏态触发 + 200 字符截断 + 聚焦态静默。
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useChatPageController } from "@/components/workspace/chats/use-chat-page-controller";

// ── hoisted mock 状态 ────────────────────────────────────────────────
const nav = vi.hoisted(() => ({
  pathname: "/workspace/chats/new",
  search: "",
  push: vi.fn(),
}));

const streamMock = vi.hoisted(() => ({
  options: undefined as Record<string, unknown> | undefined,
  sendMessage: vi.fn().mockResolvedValue(undefined),
  registerAutoSendTrigger: vi.fn(),
}));

const settingsMock = vi.hoisted(() => {
  const context = {
    agent_name: "preset-agent",
    workspace_id: "ws-9",
    user_workspace_path: "/tmp/ws-9",
    reasoning_effort: "medium",
  };
  const settings = {
    notification: { enabled: true },
    appearance: {},
    context,
  };
  return {
    context,
    settings,
    setSettings: vi.fn(),
    saveAgentName: vi.fn(),
    saveWorkspacePath: vi.fn(),
    saveWorkspaceId: vi.fn(),
  };
});

const apiMock = vi.hoisted(() => ({
  copy: vi.fn(),
  clientArgs: [] as Array<boolean | undefined>,
}));

const notifyMock = vi.hoisted(() => ({ showNotification: vi.fn() }));
const toastMock = vi.hoisted(() => ({ info: vi.fn() }));

// ── 模块 mock ────────────────────────────────────────────────────────
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: nav.push,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/core/threads/hooks", () => ({
  useThreadStream: (options: Record<string, unknown>) => {
    streamMock.options = options;
    return {
      thread: {
        messages: [],
        values: {},
        isLoading: false,
        error: null,
        stop: vi.fn().mockResolvedValue(undefined),
      },
      sendMessage: streamMock.sendMessage,
      isUploading: false,
      isHistoryLoading: false,
      hasMoreHistory: false,
      loadMoreHistory: vi.fn(),
      currentRunId: null,
      registerAutoSendTrigger: streamMock.registerAutoSendTrigger,
    };
  },
}));

vi.mock("@/core/settings", () => ({
  useThreadSettings: () => [settingsMock.settings, settingsMock.setSettings],
  useLocalSettings: () => [settingsMock.settings, vi.fn()],
  saveThreadAgentName: settingsMock.saveAgentName,
  saveThreadWorkspacePath: settingsMock.saveWorkspacePath,
  saveThreadWorkspaceId: settingsMock.saveWorkspaceId,
}));

vi.mock("@/core/api/api-client", () => ({
  getAPIClient: (isMock?: boolean) => {
    apiMock.clientArgs.push(isMock);
    return { threads: { copy: apiMock.copy } };
  },
}));

vi.mock("@/core/api/inject", () => ({
  injectMessage: vi.fn(),
  InjectError: class InjectError extends Error {
    code?: string;
    status?: number;
  },
}));

vi.mock("@/core/notification/hooks", () => ({
  useNotification: () => ({
    permission: "granted",
    isSupported: true,
    requestPermission: vi.fn(),
    showNotification: notifyMock.showNotification,
  }),
}));

vi.mock("sonner", () => ({
  toast: { info: toastMock.info, error: vi.fn(), success: vi.fn() },
}));

// i18n 桩必须提供真实两级结构：controller 沿 t.<section>.<key> 取值。
vi.mock("@/core/i18n/hooks", () => ({
  useI18n: () => ({
    locale: "zh-CN",
    t: {
      queue: { toast: { queued: "已加入队列" } },
      common: { notAvailableInDemoMode: "demo-hint" },
      agents: { newChat: "新任务" },
    },
  }),
}));

function setRoute(pathname: string, search = "") {
  nav.pathname = pathname;
  nav.search = search;
}

/** flush 挂载 effects（act 回调体非空以满足 lint）。 */
async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  setRoute("/workspace/chats/new");
  vi.clearAllMocks();
  localStorage.clear();
});

// ── 1. agent_name 传递路径 ───────────────────────────────────────────
describe("useChatPageController: agent_name 注入", () => {
  test("workspace 作用域：context 原样传入 stream，发送不带 extraContext", () => {
    setRoute("/workspace/chats/t-ws-1");
    const { result } = renderHook(() =>
      useChatPageController({ scope: "workspace" }),
    );

    // context 是原样引用（不展开、不注入 agent_name）
    expect(streamMock.options?.context).toBe(settingsMock.context);
    // isMock 透传给 useThreadStream（workspace 页既有行为）
    expect(streamMock.options?.isMock).toBe(false);
    // 发送前退出新任务态（workspace 页 onSend 既有行为）
    expect(streamMock.options?.onSend).toBeTypeOf("function");

    const message = { text: "hello", files: [] };
    act(() => result.current.handleSubmit(message as never));
    expect(streamMock.sendMessage).toHaveBeenCalledWith(
      result.current.threadId,
      message,
      undefined,
    );
  });

  test("agent 作用域：context 注入 agent_name，三条发送通路均携带 extraContext", async () => {
    setRoute("/workspace/agents/coder/chats/t-ag-1");
    const { result } = renderHook(() =>
      useChatPageController({ scope: "agent", agentName: "coder" }),
    );

    expect(streamMock.options?.context).toEqual({
      ...settingsMock.context,
      agent_name: "coder",
    });
    // agent 页历史实现不透传 isMock（始终走真实客户端）
    expect(streamMock.options?.isMock).toBeUndefined();
    // agent 页无发送前退出新任务态的 onSend
    expect(streamMock.options?.onSend).toBeUndefined();

    // 通路一：输入框提交
    act(() => result.current.handleSubmit({ text: "hi", files: [] }));
    expect(streamMock.sendMessage).toHaveBeenCalledWith(
      result.current.threadId,
      { text: "hi", files: [] },
      { agent_name: "coder" },
    );

    // 通路二：human-input 澄清卡
    const response = { value: "42" };
    act(() => result.current.handleHumanInputSubmit(response as never));
    expect(streamMock.sendMessage).toHaveBeenCalledWith(
      result.current.threadId,
      { text: "42", files: [] },
      { agent_name: "coder" },
      { additionalKwargs: { human_input_response: response } },
    );

    // 通路三：队列 autoSendNext（真实 coordinator → 适配器）
    act(() => result.current.handleEnqueue({ text: "queued-1", files: [] }));
    await act(async () => {
      await result.current.coordinator.autoSendNext();
    });
    expect(streamMock.sendMessage).toHaveBeenCalledWith(
      result.current.threadId,
      { text: "queued-1", files: [] },
      { agent_name: "coder" },
    );
  });
});

// ── 2. 队列 handler 绑定 ─────────────────────────────────────────────
describe("useChatPageController: 队列 handler 绑定", () => {
  test("handleEnqueue 落库 pending + toast；handleRetryQueued 走降级发送链", async () => {
    setRoute("/workspace/chats/t-q-1");
    const { result } = renderHook(() =>
      useChatPageController({ scope: "workspace" }),
    );

    act(() =>
      result.current.handleEnqueue({
        text: "任务A",
        files: [{ filename: "a.png", url: "blob:x" }],
      } as never),
    );
    expect(toastMock.info).toHaveBeenCalledWith("已加入队列");
    expect(result.current.coordinator.messages).toHaveLength(1);
    expect(result.current.coordinator.messages[0]).toMatchObject({
      content: "任务A",
      status: "pending",
    });

    // 置为 error 后重试：先降级回 pending，再 autoSendNext 发出并移除
    const errored = result.current.coordinator.messages[0]!;
    act(() =>
      result.current.coordinator.updateStatus(errored.id, "error", "boom"),
    );
    expect(result.current.coordinator.messages[0]!.status).toBe("error");

    // handleRetryQueued 内部对 autoSendNext 是 fire-and-forget，轮询终态
    act(() => {
      result.current.handleRetryQueued(
        result.current.coordinator.messages[0]!,
      );
    });
    await waitFor(() =>
      expect(result.current.coordinator.messages).toHaveLength(0),
    );
    // workspace 作用域队列适配器不带 extraContext
    expect(streamMock.sendMessage).toHaveBeenCalledWith(
      result.current.threadId,
      {
        text: "任务A",
        files: [{ filename: "a.png", url: "blob:x" }],
      },
      undefined,
    );
    expect(result.current.coordinator.messages).toHaveLength(0);
  });

  test("autoSendTrigger 注册到 onFinish 链路", () => {
    setRoute("/workspace/chats/t-q-2");
    renderHook(() => useChatPageController({ scope: "workspace" }));
    expect(streamMock.registerAutoSendTrigger).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });
});

// ── 3. URL 构造 ──────────────────────────────────────────────────────
describe("useChatPageController: URL 构造", () => {
  test("workspace：onStart replaceState 到 /workspace/chats/<id> 并固化锁定快照", () => {
    setRoute("/workspace/chats/new");
    renderHook(() => useChatPageController({ scope: "workspace" }));
    const replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);

    try {
      act(() =>
        (streamMock.options!.onStart as (id: string) => void)("created-1"),
      );
      expect(replaceState).toHaveBeenCalledWith(
        null,
        "",
        "/workspace/chats/created-1",
      );
      expect(settingsMock.saveAgentName).toHaveBeenCalledWith(
        "created-1",
        "preset-agent",
      );
      expect(settingsMock.saveWorkspacePath).toHaveBeenCalledWith(
        "created-1",
        "/tmp/ws-9",
      );
      expect(settingsMock.saveWorkspaceId).toHaveBeenCalledWith(
        "created-1",
        "ws-9",
      );
    } finally {
      replaceState.mockRestore();
    }
  });

  test("agent：onStart replaceState 到 /workspace/agents/<name>/chats/<id>，不固化快照", () => {
    setRoute("/workspace/agents/coder/chats/new");
    renderHook(() =>
      useChatPageController({ scope: "agent", agentName: "coder" }),
    );
    const replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);

    try {
      act(() =>
        (streamMock.options!.onStart as (id: string) => void)("created-2"),
      );
      expect(replaceState).toHaveBeenCalledWith(
        null,
        "",
        "/workspace/agents/coder/chats/created-2",
      );
      expect(settingsMock.saveAgentName).not.toHaveBeenCalled();
      expect(settingsMock.saveWorkspacePath).not.toHaveBeenCalled();
      expect(settingsMock.saveWorkspaceId).not.toHaveBeenCalled();
    } finally {
      replaceState.mockRestore();
    }
  });

  test("分支副本：workspace 用 pushState + isMock 客户端，agent 用 router.push + 编码", async () => {
    // workspace
    setRoute("/workspace/chats/t-b1");
    apiMock.copy.mockResolvedValue({ thread_id: "copy-1" });
    const pushState = vi
      .spyOn(window.history, "pushState")
      .mockImplementation(() => undefined);
    const ws = renderHook(() =>
      useChatPageController({ scope: "workspace" }),
    );
    await act(async () => {
      await ws.result.current.handleBranchThread();
    });
    expect(apiMock.copy).toHaveBeenCalledWith("t-b1");
    expect(apiMock.clientArgs.at(-1)).toBe(false); // 跟随 isMock=false
    expect(pushState).toHaveBeenCalledWith(null, "", "/workspace/chats/copy-1");
    pushState.mockRestore();

    // agent（agent_name 走 encodeURIComponent，与历史实现一致）
    setRoute("/workspace/agents/coder/chats/t-b2");
    apiMock.copy.mockResolvedValue({ thread_id: "copy-2" });
    const ag = renderHook(() =>
      useChatPageController({ scope: "agent", agentName: "coder" }),
    );
    await act(async () => {
      await ag.result.current.handleBranchThread();
    });
    expect(apiMock.clientArgs.at(-1)).toBeUndefined(); // 不透传 isMock
    expect(nav.push).toHaveBeenCalledWith("/workspace/agents/coder/chats/copy-2");
  });
});

// ── 4. 草稿重置（仅 workspace 生效） ─────────────────────────────────
describe("useChatPageController: 草稿重置", () => {
  test("workspace 新任务草稿清空工作区选择；带 ?workspace= 时豁免", async () => {
    setRoute("/workspace/chats/new");
    renderHook(() => useChatPageController({ scope: "workspace" }));
    await waitFor(() =>
      expect(settingsMock.setSettings).toHaveBeenCalledWith("context", {
        workspace_id: undefined,
        user_workspace_path: undefined,
      }),
    );

    // 显式 ?workspace= 由 InputBox 的 useWorkspaceParamPreset 负责，这里不插手
    setRoute("/workspace/chats/new", "?workspace=ws-9");
    renderHook(() => useChatPageController({ scope: "workspace" }));
    await flushEffects();
    expect(settingsMock.setSettings).toHaveBeenCalledTimes(1);
  });

  test("agent 作用域永不触发草稿重置", async () => {
    setRoute("/workspace/agents/coder/chats/new");
    renderHook(() =>
      useChatPageController({ scope: "agent", agentName: "coder" }),
    );
    await flushEffects();
    expect(settingsMock.setSettings).not.toHaveBeenCalled();
  });
});

// ── 5. 桌面通知 ──────────────────────────────────────────────────────
describe("useChatPageController: 桌面通知", () => {
  test("隐藏态触发通知并截断 200 字符；聚焦态静默", () => {
    setRoute("/workspace/chats/t-n1");
    renderHook(() => useChatPageController({ scope: "workspace" }));
    const onFinish = streamMock.options!.onFinish as (state: unknown) => void;

    // 隐藏态：触发通知（hidden 覆盖在实例上，结束后删除以恢复原型 getter）
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    try {
      // 正文截断：>200 字符取前 200 + "..."
      act(() =>
        onFinish({
          title: "任务标题",
          messages: [{ content: "x".repeat(250) }],
        }),
      );
      expect(notifyMock.showNotification).toHaveBeenCalledWith("任务标题", {
        body: "x".repeat(200) + "...",
      });

      // 空消息回退默认文案
      act(() => onFinish({ title: "t2", messages: [] }));
      expect(notifyMock.showNotification).toHaveBeenLastCalledWith("t2", {
        body: "Conversation finished",
      });
    } finally {
      delete (document as unknown as { hidden?: boolean }).hidden;
    }

    // 聚焦 + 可见：不触发（happy-dom 默认 hidden=false；hasFocus 需显式 stub 为 true）
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    try {
      act(() => onFinish({ title: "t3", messages: [{ content: "y" }] }));
      expect(notifyMock.showNotification).toHaveBeenCalledTimes(2);
    } finally {
      hasFocus.mockRestore();
    }
  });
});
