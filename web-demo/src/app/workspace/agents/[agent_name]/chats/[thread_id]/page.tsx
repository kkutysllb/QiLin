"use client";

import { BotIcon, PlusSquare } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { AgentWelcome } from "@/components/workspace/agent-welcome";
import { ArtifactTrigger } from "@/components/workspace/artifacts";
import { ChatBox, useThreadChat } from "@/components/workspace/chats";
import {
  MESSAGE_FEED_DEFAULT_PADDING_BOTTOM,
  MessageFeed,
} from "@/components/workspace/chat/message-feed";
import { InputBox } from "@/components/workspace/input-box";
import { ThreadContext } from "@/components/workspace/messages/context";
import { ThreadTitle } from "@/components/workspace/thread-title";
import { Tooltip } from "@/components/workspace/tooltip";
import { useAgent } from "@/core/agents";
import { useI18n } from "@/core/i18n/hooks";
import type { HumanInputResponse } from "@/core/messages/human-input";
import { useNotification } from "@/core/notification/hooks";
import { useThreadSettings } from "@/core/settings";
import { useThreadStream } from "@/core/threads/hooks";
import type { QueuedMessage } from "@/core/threads/queue-store";
import { useQueueCoordinator } from "@/core/threads/use-queue-coordinator";
import { textOfMessage } from "@/core/threads/utils";
import { env } from "@/env";
import { cn } from "@/lib/utils";

function parseAgentNameFromPath(pathname: string | null): string {
  if (!pathname) return "";
  const match = /\/workspace\/agents\/([^/]+)\//.exec(pathname);
  const raw = match?.[1];
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function AgentChatPage() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  // In the Electron desktop build, useParams() returns stale values from the
  // pre-rendered new.html RSC payload. Parse agent_name from the real URL.
  const agent_name = parseAgentNameFromPath(pathname);

  const { agent } = useAgent(agent_name);

  const { threadId, setThreadId, isNewThread, setIsNewThread } =
    useThreadChat();
  const [settings, setSettings] = useThreadSettings(threadId);

  const { showNotification } = useNotification();
  const {
    thread,
    sendMessage,
    isHistoryLoading,
    hasMoreHistory,
    loadMoreHistory,
    currentRunId,
    registerAutoSendTrigger,
  } = useThreadStream({
    threadId: isNewThread ? undefined : threadId,
    context: { ...settings.context, agent_name: agent_name },
    onStart: (createdThreadId) => {
      setThreadId(createdThreadId);
      setIsNewThread(false);
      // ! Important: Never use next.js router for navigation in this case, otherwise it will cause the thread to re-mount and lose all states. Use native history API instead.
      const nextPath = `/workspace/agents/${agent_name}/chats/${createdThreadId}`;
      history.replaceState(null, "", nextPath);
    },
    onFinish: (state) => {
      if (document.hidden || !document.hasFocus()) {
        let body = "Conversation finished";
        const lastMessage = state.messages[state.messages.length - 1];
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
      void sendMessage(threadId, message, { agent_name });
    },
    [sendMessage, threadId, agent_name],
  );

  const handleStop = useCallback(async () => {
    await thread.stop();
  }, [thread]);

  const handleHumanInputSubmit = useCallback(
    (response: HumanInputResponse) => {
      void sendMessage(
        threadId,
        { text: response.value, files: [] },
        { agent_name },
        { additionalKwargs: { human_input_response: response } },
      );
    },
    [sendMessage, threadId, agent_name],
  );

  // ── 队列协调器（Task 16） ──────────────────────────────────────────
  // sendMessage 签名适配：ThreadStreamLike 期望 (content, attachments)，
  // 而真实 sendMessage 是 (threadId, PromptInputMessage[, extraContext])。
  // 这里把 agent_name 作为 extraContext 一并传入，保持与 handleSubmit 一致。
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
          { agent_name },
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
    <ThreadContext.Provider value={{ thread }}>
      <ChatBox threadId={threadId}>
        <div className="relative flex size-full min-h-0 justify-between">
          <header
            className={cn(
              // [-webkit-app-region:drag] makes the header a window-drag
              // zone on Electron so double-click toggles macOS maximize.
              "absolute top-0 right-0 left-0 z-30 flex h-12 shrink-0 items-center gap-2 px-4 [-webkit-app-region:drag]",
              isNewThread
                ? "bg-background/0 backdrop-blur-none"
                : "bg-background/80 shadow-xs backdrop-blur",
            )}
          >
            {/* Agent badge */}
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 [-webkit-app-region:no-drag]">
              <BotIcon className="text-primary h-3.5 w-3.5" />
              <span className="text-xs font-medium">
                {agent?.name ?? agent_name}
              </span>
            </div>

            <div className="flex w-full items-center text-sm font-medium [-webkit-app-region:no-drag]">
              <ThreadTitle threadId={threadId} thread={thread} />
            </div>
            <div className="mr-4 flex items-center [-webkit-app-region:no-drag]">
              <Tooltip content={t.agents.newChat}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    router.push(`/workspace/agents/${agent_name}/chats/new`);
                  }}
                >
                  <PlusSquare /> {t.agents.newChat}
                </Button>
              </Tooltip>
              <ArtifactTrigger />
            </div>
          </header>

          <main className="flex min-h-0 max-w-full grow flex-col">
            <div className="flex size-full justify-center">
              <MessageFeed
                className={cn("size-full", !isNewThread && "pt-10")}
                threadId={threadId}
                thread={thread}
                paddingBottom={messageListPaddingBottom}
                hasMoreHistory={hasMoreHistory}
                loadMoreHistory={loadMoreHistory}
                isHistoryLoading={isHistoryLoading}
                onHumanInputSubmit={handleHumanInputSubmit}
              />
            </div>

            <div className="absolute right-0 bottom-0 left-0 z-30 flex justify-center px-4">
              <div
                className={cn(
                  "relative w-full",
                  isNewThread && "-translate-y-[calc(50vh-96px)]",
                  isNewThread
                    ? "max-w-(--container-width-sm)"
                    : "max-w-(--chat-message-width)",
                )}
              >
                {isNewThread && (
                  <div className={cn("max-w-(--container-width-sm) mx-auto w-full")}>
                    <AgentWelcome agent={agent} agentName={agent_name} />
                  </div>
                )}

                <InputBox
                  className={cn("bg-background/5 w-full", isNewThread ? "" : "-translate-y-4")}
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
                  disabled={env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true"}
                  onContextChange={(context) => setSettings("context", context)}
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
                {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" && (
                  <div className="text-muted-foreground/67 w-full translate-y-12 text-center text-xs">
                    {t.common.notAvailableInDemoMode}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </ChatBox>
    </ThreadContext.Provider>
  );
}
