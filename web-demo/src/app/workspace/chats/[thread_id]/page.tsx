"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { type PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { ArtifactTrigger } from "@/components/workspace/artifacts";
import {
  ChatBox,
  useSpecificChatMode,
  useThreadChat,
} from "@/components/workspace/chats";
import { TaskTokenSummary } from "@/components/workspace/token-usage/task-token-summary";
import { InputBox } from "@/components/workspace/input-box";
import {
  MESSAGE_FEED_DEFAULT_PADDING_BOTTOM,
  MessageFeed,
} from "@/components/workspace/chat/message-feed";
import { ThreadContext } from "@/components/workspace/messages/context";
import { Welcome } from "@/components/workspace/welcome";
import { useI18n } from "@/core/i18n/hooks";
import type { HumanInputResponse } from "@/core/messages/human-input";
import { useNotification } from "@/core/notification/hooks";
import {
  useThreadSettings,
  saveThreadAgentName,
  saveThreadWorkspacePath,
} from "@/core/settings";
import { useThreadStream } from "@/core/threads/hooks";
import type { QueuedMessage } from "@/core/threads/queue-store";
import { useQueueCoordinator } from "@/core/threads/use-queue-coordinator";
import { textOfMessage } from "@/core/threads/utils";
import { env } from "@/env";
import { cn } from "@/lib/utils";

export default function ChatPage() {
  const { t } = useI18n();
  const { threadId, setThreadId, isNewThread, setIsNewThread, isMock } =
    useThreadChat();
  const [settings, setSettings] = useThreadSettings(threadId);
  const mountedRef = useRef(false);
  useSpecificChatMode();

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  const { showNotification } = useNotification();

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
    context: settings.context,
    isMock,
    onSend: (_threadId) => {
      setThreadId(_threadId);
      setIsNewThread(false);
    },
    onStart: (createdThreadId) => {
      setThreadId(createdThreadId);
      setIsNewThread(false);
      // ! Important: Never use next.js router for navigation in this case, otherwise it will cause the thread to re-mount and lose all states. Use native history API instead.
      const nextPath = `/workspace/chats/${createdThreadId}`;
      history.replaceState(null, "", nextPath);
      // Lock the lead agent for this thread so reopening it always
      // uses the same AgentConfig preset.
      saveThreadAgentName(createdThreadId, settings.context.agent_name as string | undefined);
      // Lock the user-selected workspace path so reopening the thread
      // restores the same directory sandbox permissions.
      saveThreadWorkspacePath(
        createdThreadId,
        settings.context.user_workspace_path as string | undefined,
      );
    },
    onFinish: (state) => {
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
  });

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      void sendMessage(threadId, message);
    },
    [sendMessage, threadId],
  );
  const handleStop = useCallback(async () => {
    await thread.stop();
  }, [thread]);

  const handleHumanInputSubmit = useCallback(
    (response: HumanInputResponse) => {
      void sendMessage(threadId, {
        text: response.value,
        files: [],
      }, undefined, {
        additionalKwargs: { human_input_response: response },
      });
    },
    [sendMessage, threadId],
  );

  // ── 队列协调器（Task 16） ──────────────────────────────────────────
  // sendMessage 签名适配：ThreadStreamLike 期望 (content, attachments)，
  // 而真实 sendMessage 是 (threadId, PromptInputMessage)。这里用闭包包装。
  const coordinator = useQueueCoordinator(
    threadId,
    {
      sendMessage: (content, attachments) =>
        sendMessage(threadId, {
          text: content,
          files: (attachments ?? []) as PromptInputMessage["files"],
        }),
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

  const messageListPaddingBottom = undefined;

  return (
    <ThreadContext.Provider value={{ thread, isMock }}>
      <ChatBox threadId={threadId}>
        <div className="relative flex size-full min-h-0 justify-between">
          <header
            className={cn(
              // [-webkit-app-region:drag] makes the header a window-drag
              // zone on Electron so double-click toggles macOS maximize,
              // matching the landing page title-bar behavior.
              "absolute top-0 right-0 left-0 z-30 flex h-12 shrink-0 items-center justify-end px-4 [-webkit-app-region:drag]",
              isNewThread
                ? "bg-background/0 backdrop-blur-none"
                : "bg-background/80 shadow-xs backdrop-blur",
            )}
          >
            <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
              <ArtifactTrigger />
            </div>
          </header>
          <main className="flex min-h-0 max-w-full grow flex-col">
            {/* Main content area: existing conversation OR new-thread welcome */}
            {isNewThread ? (
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4">
                <div className="mx-auto w-full py-8">
                  <Welcome effort={settings.context.reasoning_effort} />
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 justify-center">
                <MessageFeed
                  className={cn("size-full pt-10")}
                  threadId={threadId}
                  thread={thread}
                  paddingBottom={messageListPaddingBottom}
                  hasMoreHistory={hasMoreHistory}
                  loadMoreHistory={loadMoreHistory}
                  isHistoryLoading={isHistoryLoading}
                  onHumanInputSubmit={handleHumanInputSubmit}
                />
              </div>
            )}
            {/* Input box: anchored to the bottom on both new and existing threads */}
            <div className="flex shrink-0 justify-center px-4 pb-4">
              <div className="relative w-full max-w-(--chat-message-width)">
                {mountedRef.current ? (
                  <InputBox
                    className="bg-background/5 w-full"
                    isNewThread={isNewThread}
                    threadId={threadId}
                    autoFocus={isNewThread}
                    status={
                      thread.error
                        ? "error"
                        : thread.isLoading
                          ? "streaming"
                          : "ready"
                    }
                    context={settings.context}
                    disabled={
                      env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" ||
                      isUploading
                    }
                    onContextChange={(context) =>
                      setSettings("context", context)
                    }
                    onSubmit={handleSubmit}
                    onStop={handleStop}
                    onEnqueue={handleEnqueue}
                    queuedMessages={coordinator.messages}
                    onInjectFromQueue={coordinator.injectNow}
                    onRemoveFromQueue={coordinator.remove}
                    onEditQueued={coordinator.editContent}
                    onRetryQueued={handleRetryQueued}
                    onReorderQueued={coordinator.reorder}
                    onSendAllQueued={coordinator.manualSendAll}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="bg-background/5 h-32 w-full rounded-2xl"
                  />
                )}
                {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" && (
                  <div className="text-muted-foreground/67 w-full translate-y-12 text-center text-xs">
                    {t.common.notAvailableInDemoMode}
                  </div>
                )}
                <TaskTokenSummary
                  className="mt-2"
                  messages={thread.messages ?? []}
                />
              </div>
            </div>
          </main>
        </div>
      </ChatBox>
    </ThreadContext.Provider>
  );
}
