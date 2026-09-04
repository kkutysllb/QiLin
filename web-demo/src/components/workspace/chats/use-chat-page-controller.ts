"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { type PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { ThreadContextType } from "@/components/workspace/messages/context";
import { getAPIClient } from "@/core/api/api-client";
import { injectMessage } from "@/core/api/inject";
import { useI18n } from "@/core/i18n/hooks";
import type { HumanInputResponse } from "@/core/messages/human-input";
import { useNotification } from "@/core/notification/hooks";
import {
  saveThreadAgentName,
  saveThreadWorkspaceId,
  saveThreadWorkspacePath,
  useThreadSettings,
  type LocalSettings,
} from "@/core/settings";
import { useThreadStream } from "@/core/threads/hooks";
import type { QueuedMessage } from "@/core/threads/queue-store";
import type { AgentThreadState } from "@/core/threads/types";
import { useQueueCoordinator } from "@/core/threads/use-queue-coordinator";
import { textOfMessage } from "@/core/threads/utils";
import { useWorkspaceDraftReset } from "@/core/workspaces/use-workspace-draft-reset";

import { useThreadChat } from "./use-thread-chat";

/**
 * 聊天页作用域：全局工作区路由（/workspace/chats/[thread_id]）或
 * Agent 路由（/workspace/agents/[agent_name]/chats/[thread_id]）。
 */
export type ChatPageScope = "workspace" | "agent";

/**
 * 作用域差异的唯一裁决点。
 *
 * 两个聊天页的全部行为差异都在这里显式化为配置，controller 内部禁止
 * 再散落 if (scope === "agent") 判断。每个字段的注释都标明了它承载的
 * 是哪个页面的既有行为（重构前的逐字对应关系）。
 */
interface ChatPageScopeConfig {
  /** 全局「新任务」草稿清空工作区选择（仅 workspace 页，useWorkspaceDraftReset）。 */
  draftReset: boolean;
  /** 发送瞬间（线程创建前）就退出「新任务」态（仅 workspace 页的 onSend）。 */
  exitNewThreadOnSend: boolean;
  /** 新线程创建后固化 agent/workspace 锁定快照（仅 workspace 页的 saveThread*）。 */
  persistContextLocks: boolean;
  /** useThreadStream 透传 isMock（agent 页历史实现不透传，始终走真实客户端）。 */
  passIsMockToStream: boolean;
  /** ThreadContext.Provider 是否携带 isMock（agent 页历史仅传 { thread }）。 */
  provideIsMockToContext: boolean;
  /** threads.copy 跟随 isMock 走 mock 客户端（仅 workspace 页）。 */
  copyFollowsIsMock: boolean;
  /** 分支副本跳转：workspace 用 pushState 防止 RSC 重挂载，agent 用 next router。 */
  branchNavigate: "push-state" | "router";
  /** 发送消息附带的 extraContext：agent 页注入 { agent_name }，workspace 页不注入。 */
  extraContext: Record<string, unknown> | undefined;
  /** useThreadStream 的 context 装配：agent 页把 agent_name 合入 context。 */
  streamContext(
    context: LocalSettings["context"],
  ): LocalSettings["context"];
  /** 线程页 URL（onStart 的 replaceState 与「新任务」按钮共用）。 */
  threadPath(threadId: string): string;
  /** 分支副本 URL（注意：agent 页仅对 agent_name 做 encodeURIComponent）。 */
  branchThreadPath(threadId: string): string;
}

function resolveChatPageScopeConfig(
  scope: ChatPageScope,
  agentName: string | undefined,
): ChatPageScopeConfig {
  if (scope === "agent") {
    return {
      draftReset: false,
      exitNewThreadOnSend: false,
      persistContextLocks: false,
      passIsMockToStream: false,
      provideIsMockToContext: false,
      copyFollowsIsMock: false,
      branchNavigate: "router",
      extraContext: { agent_name: agentName },
      streamContext: (context) => ({ ...context, agent_name: agentName }),
      threadPath: (threadId) =>
        `/workspace/agents/${agentName}/chats/${threadId}`,
      branchThreadPath: (threadId) =>
        "/workspace/agents/" +
        encodeURIComponent(agentName ?? "") +
        "/chats/" +
        threadId,
    };
  }
  return {
    draftReset: true,
    exitNewThreadOnSend: true,
    persistContextLocks: true,
    passIsMockToStream: true,
    provideIsMockToContext: true,
    copyFollowsIsMock: true,
    branchNavigate: "push-state",
    extraContext: undefined,
    streamContext: (context) => context,
    threadPath: (threadId) => `/workspace/chats/${threadId}`,
    branchThreadPath: (threadId) => `/workspace/chats/${threadId}`,
  };
}

export interface UseChatPageControllerOptions {
  scope: ChatPageScope;
  /**
   * agent 作用域必填：从真实 URL 解析出的 agent_name（Electron 静态导出下
   * useParams 会拿到 new.html RSC payload 里的过期值，由页面负责解析）。
   */
  agentName?: string;
}

/**
 * 双路由聊天页的共享控制器：收编 useThreadChat / useThreadSettings /
 * useThreadStream / 队列协调器 / 桌面通知 / stop / branch / human-input。
 *
 * 行为保持约定（收敛自两页的平行实现）：
 * - 桌面通知：仅 document.hidden || !document.hasFocus() 时触发，正文取
 *   最后一条消息文本并截断到 200 字符；
 * - 队列 409/404 降级链在 useQueueCoordinator 内部，保持原样；
 * - 草稿重置只在 workspace 页生效，且必须先于 mountedRef 注册 effect
 *   （见下方注释），保证 InputBox 首帧就是「未选择」态；
 * - URL 构造：workspace 用 history.replaceState/pushState 原生 API
 *   （禁用 next router，防止线程重挂载丢状态），agent 用 router.push；
 *   InputBox 的 ?workspace= 参数预设（useWorkspaceParamPreset）不受影响。
 */
export function useChatPageController({
  scope,
  agentName,
}: UseChatPageControllerOptions) {
  const { t } = useI18n();
  const router = useRouter();
  const scopeConfig = useMemo(
    () => resolveChatPageScopeConfig(scope, agentName),
    [scope, agentName],
  );

  const { threadId, setThreadId, isNewThread, setIsNewThread, isMock } =
    useThreadChat();
  const [settings, setSettings] = useThreadSettings(threadId);

  // 全局「新任务」入口（/workspace/chats/new，无 ?workspace=）：草稿不继承
  // 任何工作区选择记录——清掉从全局设置回落的选择，保持「未分组（未选择）」
  // 状态。显式 ?workspace= 的工作区预设由 InputBox 的 useWorkspaceParamPreset
  // 负责，这里不插手。放在 mountedRef 之前，保证 InputBox 首帧就是未选择态。
  // 仅 workspace 页生效（scopeConfig.draftReset）。
  const searchParams = useSearchParams();
  useWorkspaceDraftReset({
    isNewThread: scopeConfig.draftReset && isNewThread,
    hasWorkspaceParam: searchParams.has("workspace"),
    workspaceId: settings.context.workspace_id as string | undefined,
    workspacePath: settings.context.user_workspace_path as string | undefined,
    onReset: () => {
      setSettings("context", {
        workspace_id: undefined,
        user_workspace_path: undefined,
      });
    },
  });

  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  const { showNotification } = useNotification();

  // 发送瞬间（线程创建前）就退出「新任务」态——仅 workspace 页的既有行为。
  const handleThreadSend = useCallback(
    (sentThreadId: string) => {
      setThreadId(sentThreadId);
      setIsNewThread(false);
    },
    [setThreadId, setIsNewThread],
  );

  const handleStreamStart = useCallback(
    (createdThreadId: string) => {
      setThreadId(createdThreadId);
      setIsNewThread(false);
      // ! Important: Never use next.js router for navigation in this case, otherwise it will cause the thread to re-mount and lose all states. Use native history API instead.
      history.replaceState(null, "", scopeConfig.threadPath(createdThreadId));
      if (scopeConfig.persistContextLocks) {
        // Lock the lead agent for this thread so reopening it always
        // uses the same AgentConfig preset.
        saveThreadAgentName(
          createdThreadId,
          settings.context.agent_name as string | undefined,
        );
        // Lock the user-selected workspace path so reopening the thread
        // restores the same directory sandbox permissions.
        saveThreadWorkspacePath(
          createdThreadId,
          settings.context.user_workspace_path as string | undefined,
        );
        // Lock the user-selected registry workspace id so reopening the thread
        // restores the same sidebar grouping / backend workspace binding after
        // a page refresh (per-thread snapshot, mirroring user_workspace_path).
        saveThreadWorkspaceId(
          createdThreadId,
          settings.context.workspace_id as string | undefined,
        );
      }
    },
    [
      scopeConfig,
      setThreadId,
      setIsNewThread,
      settings.context,
    ],
  );

  // 桌面通知：页面失焦/隐藏时提示会话结束，正文取最后一条消息并截断 200 字符。
  // （两页逐字相同的 onFinish 块，仅 .at(-1) 与 [length-1] 写法差，统一为 .at(-1)。）
  const handleStreamFinish = useCallback(
    (state: AgentThreadState) => {
      if (document.hidden || !document.hasFocus()) {
        let body = "Conversation finished";
        const lastMessage = state.messages.at(-1);
        if (lastMessage) {
          const textContent = textOfMessage(lastMessage);
          if (textContent) {
            body =
              textContent.length > 200
                ? textContent.substring(0, 200) + "..."
                : textContent;
          }
        }
        showNotification(state.title, { body });
      }
    },
    [showNotification],
  );

  const {
    thread,
    sendMessage,
    isUploading,
    isHistoryLoading,
    hasMoreHistory,
    loadMoreHistory,
    currentRunId,
    registerAutoSendTrigger,
  } = useThreadStream({
    threadId: isNewThread ? undefined : threadId,
    context: scopeConfig.streamContext(settings.context),
    isMock: scopeConfig.passIsMockToStream ? isMock : undefined,
    onSend: scopeConfig.exitNewThreadOnSend ? handleThreadSend : undefined,
    onStart: handleStreamStart,
    onFinish: handleStreamFinish,
  });

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      void sendMessage(threadId, message, scopeConfig.extraContext);
    },
    [sendMessage, threadId, scopeConfig],
  );

  const handleStop = useCallback(async () => {
    await thread.stop();
  }, [thread]);

  const handleHumanInputSubmit = useCallback(
    (response: HumanInputResponse) => {
      void sendMessage(
        threadId,
        {
          text: response.value,
          files: [],
        },
        scopeConfig.extraContext,
        {
          additionalKwargs: { human_input_response: response },
        },
      );
    },
    [sendMessage, threadId, scopeConfig],
  );

  const handleBranchThread = useCallback(async () => {
    if (isNewThread || !threadId) return;
    const client = getAPIClient(
      scopeConfig.copyFollowsIsMock ? isMock : undefined,
    );
    const copiedThread = await client.threads.copy(threadId);
    if (!copiedThread.thread_id) {
      throw new Error("Copied thread did not return an id");
    }
    setThreadId(copiedThread.thread_id);
    setIsNewThread(false);
    const branchPath = scopeConfig.branchThreadPath(copiedThread.thread_id);
    if (scopeConfig.branchNavigate === "router") {
      router.push(branchPath);
    } else {
      history.pushState(null, "", branchPath);
    }
  }, [isNewThread, isMock, router, scopeConfig, setIsNewThread, setThreadId, threadId]);

  // ── 队列协调器（Task 16） ──────────────────────────────────────────
  // sendMessage 签名适配：ThreadStreamLike 期望 (content, attachments)，
  // 而真实 sendMessage 是 (threadId, PromptInputMessage[, extraContext])。
  // agent 页把 agent_name 作为 extraContext 一并传入，与 handleSubmit 一致。
  const coordinator = useQueueCoordinator(
    threadId,
    {
      sendMessage: (content, attachments) =>
        sendMessage(
          threadId,
          {
            text: content,
            files: (attachments ?? []) as PromptInputMessage["files"],
          },
          scopeConfig.extraContext,
        ),
    },
    currentRunId,
  );

  // 把协调器的 autoSendNext 注册到 useThreadStream 的 onFinish 链路，
  // 这样每次任务正常结束（非手动停止）就会自动发送队列里的下一条。
  useEffect(() => {
    registerAutoSendTrigger(coordinator.autoSendNext);
    return () => registerAutoSendTrigger(null);
  }, [coordinator.autoSendNext, registerAutoSendTrigger]);

  const handleEnqueue = useCallback(
    (message: PromptInputMessage) => {
      coordinator.enqueue(message.text, message.files ?? []);
      toast.info(t.queue.toast.queued);
    },
    [coordinator, t.queue.toast.queued],
  );

  // 插话发送（DSH steer 语义）：把消息直接注入运行中任务的下一次模型
  // 调用，不进本地队列。返回是否成功——false（无活动 run / 409
  // run_not_active / 404 端点缺失 / 网络失败）时 InputBox 降级回排队。
  const handleSteer = useCallback(
    async (message: PromptInputMessage): Promise<boolean> => {
      if (!currentRunId || !message.text?.trim()) return false;
      try {
        await injectMessage(threadId, currentRunId, {
          content: message.text,
          attachments: message.files ?? [],
          messageId: `steer_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          queuedAt: Date.now(),
        });
        return true;
      } catch (e) {
        console.error("[steer] inject failed; fallback to queue", e);
        return false;
      }
    },
    [currentRunId, threadId],
  );

  // 重试处于 error 态的队列消息：先降级回 pending，再触发 autoSendNext。
  // 若当前无运行任务（currentRunId 为空），injectNow 会 no-op，所以用
  // "降级 + autoSendNext" 让消息在不依赖活动 run 的情况下也能发出。
  const handleRetryQueued = useCallback(
    (msg: QueuedMessage) => {
      coordinator.updateStatus(msg.id, "pending");
      void coordinator.autoSendNext();
    },
    [coordinator],
  );

  const handleContextChange = useCallback(
    (context: LocalSettings["context"]) => {
      setSettings("context", context);
    },
    [setSettings],
  );

  const threadContextValue: ThreadContextType =
    scopeConfig.provideIsMockToContext ? { thread, isMock } : { thread };

  return {
    scope,
    agentName,
    threadId,
    setThreadId,
    isNewThread,
    setIsNewThread,
    isMock,
    settings,
    setSettings,
    thread,
    isUploading,
    isHistoryLoading,
    hasMoreHistory,
    loadMoreHistory,
    currentRunId,
    coordinator,
    /** 挂载首帧门闩：workspace 页在首帧渲染骨架占位（既有挂载时序）。 */
    mountedRef,
    /** InputBox 的 status 派生（两页逐字相同的三元链）。 */
    inputStatus: thread.error
      ? ("error" as const)
      : thread.isLoading
        ? ("streaming" as const)
        : ("ready" as const),
    threadContextValue,
    /** 「新任务」按钮的跳转地址（仅 agent 页使用）。 */
    newThreadPath: scopeConfig.threadPath("new"),
    handleSubmit,
    handleStop,
    handleHumanInputSubmit,
    handleBranchThread,
    handleEnqueue,
    handleRetryQueued,
    handleContextChange,
    handleSteer,
  };
}

export type ChatPageController = ReturnType<typeof useChatPageController>;
