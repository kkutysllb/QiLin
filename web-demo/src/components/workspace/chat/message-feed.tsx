"use client";

import type { BaseStream, Message } from "@langchain/langgraph-sdk";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useStickToBottomContext,
} from "use-stick-to-bottom";

import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/core/i18n/hooks";
import {
  deriveHumanInputThreadState,
  extractHumanInputRequest,
  type HumanInputResponse,
} from "@/core/messages/human-input";
import { parseAssistantSegments } from "@/core/messages/segments";
import {
  extractContentFromMessage,
  extractPresentFilesFromMessage,
  groupMessages,
  hasContent,
  hasPresentFiles,
  isHiddenFromUIMessage,
} from "@/core/messages/utils";
import { useUpdateSubtask } from "@/core/tasks/context";
import type { AgentThreadState } from "@/core/threads";
import {
  buildEditResubmitMessages,
  buildRegenerateMessages,
  prepareEditRegenerate,
  prepareRegenerate,
} from "@/core/threads/regenerate";
import { checkCodeFile } from "@/core/utils/files";
import { cn } from "@/lib/utils";

import { ArtifactFileList } from "../artifacts/artifact-file-list";
import {
  HumanInputCard,
  type HumanInputSubmitResult,
} from "../messages/human-input-card";
import { MarkdownContent } from "../messages/markdown-content";
import { MessageListSkeleton } from "../messages/skeleton";
import { SubtaskCard } from "../messages/subtask-card";

import { MessageItem } from "./message-item";
import { NeuralWaveSpinner } from "./segments/neural-wave-spinner";
import { ReportCard } from "./segments/report-card";
import { SegmentList } from "./segments/segment-list";

export const MESSAGE_FEED_DEFAULT_PADDING_BOTTOM = 160;
export const MESSAGE_FEED_FOLLOWUPS_EXTRA_PADDING_BOTTOM = 80;

const LOAD_MORE_HISTORY_THROTTLE_MS = 1200;

/**
 * MessageFeed — the new chat message container (Layer 0).
 *
 * The scroll container is owned by the underlying `use-stick-to-bottom`
 * library (via `Conversation`); auto-follow to new content is handled by
 * the library, and the floating "scroll to bottom" button reads
 * `isAtBottom` from the library context so it only ever reflects the
 * *real* scroll position.
 */
export function MessageFeed({
  className,
  threadId,
  thread,
  paddingBottom = MESSAGE_FEED_DEFAULT_PADDING_BOTTOM,
  hasMoreHistory,
  loadMoreHistory,
  isHistoryLoading,
  onHumanInputSubmit,
}: {
  className?: string;
  threadId: string;
  thread: BaseStream<AgentThreadState>;
  paddingBottom?: number;
  hasMoreHistory?: boolean;
  loadMoreHistory?: () => void;
  isHistoryLoading?: boolean;
  /** Called when the user submits a clarification card response. */
  onHumanInputSubmit?: (
    response: HumanInputResponse,
  ) => HumanInputSubmitResult | Promise<HumanInputSubmitResult>;
}) {
  const { t } = useI18n();
  const updateSubtask = useUpdateSubtask();

  // Memoize the filtered message list so it has a stable reference across
  // re-renders (as long as thread.messages hasn't changed).  Without this,
  // every consumer that depends on `messages` (useEffect deps, child
  // useMemo via contextMessages prop) re-runs on each render.
  const messages = useMemo(
    () => thread.messages.filter((msg) => !isHiddenFromUIMessage(msg)),
    [thread.messages],
  );

  // Only the last visible message is actively streaming — every earlier
  // message is history and must render in its final (done) state.
  const streamingMessageId = thread.isLoading
    ? messages[messages.length - 1]?.id
    : undefined;

  // Clarification answers ride on the user's reply messages as
  // additional_kwargs.human_input_response (including the optimistic copy
  // sent right after submit), so the card can show the user's actual
  // choices instead of the untouched default form.
  const answeredResponses = useMemo(
    () => deriveHumanInputThreadState(messages).answeredResponses,
    [messages],
  );

  // ── Regenerate & edit-resubmit ─────────────────────────────────────────
  // Preferred: the gateway's checkpoint-replay prepare endpoints return a
  // validated {input, checkpoint, metadata} triple that restores titles and
  // handles interrupted turns. Fallback: rewrite history through one run
  // input ({role:"remove"} dicts the backend coerces to RemoveMessage; the
  // edited human message re-submitted with the same id replaces it).
  const submitThreadMessages = useCallback(
    (inputMessages: Message[]) => {
      void thread.submit({ messages: inputMessages } as Partial<AgentThreadState>);
    },
    [thread],
  );

  const handleRegenerate = useCallback(() => {
    if (thread.isLoading) return;
    const lastAi = [...messages].reverse().find((msg) => msg.type === "ai");
    void (async () => {
      const prepared =
        lastAi?.id != null
          ? await prepareRegenerate(threadId, lastAi.id)
          : null;
      if (prepared) {
        await thread.submit(prepared.input as Partial<AgentThreadState>, {
          checkpoint: prepared.checkpoint,
          metadata: prepared.metadata,
        } as Parameters<typeof thread.submit>[1]);
        return;
      }
      const fallback = buildRegenerateMessages(thread.messages);
      if (fallback) submitThreadMessages(fallback);
    })();
  }, [thread, threadId, messages, submitThreadMessages]);

  const handleEditMessage = useCallback(
    (messageId: string, replacementText: string) => {
      if (thread.isLoading) return;
      void (async () => {
        const prepared = await prepareEditRegenerate(
          threadId,
          messageId,
          replacementText,
        );
        if (prepared) {
          await thread.submit(
            prepared.input as Partial<AgentThreadState>,
            {
              checkpoint: prepared.checkpoint,
              metadata: prepared.metadata,
            } as Parameters<typeof thread.submit>[1],
          );
          return;
        }
        const fallback = buildEditResubmitMessages(
          thread.messages,
          messageId,
          replacementText,
        );
        if (fallback) submitThreadMessages(fallback);
      })();
    },
    [thread, threadId, submitThreadMessages],
  );

  const canRegenerate =
    !thread.isLoading &&
    messages.length > 0 &&
    messages[messages.length - 1]?.type !== "human";

  // Populate subtask context from AI messages that contain `task` tool
  // calls.  This MUST be in useEffect — calling updateSubtask (which calls
  // setTasks on the SubtasksProvider) during render causes an infinite
  // re-render loop:  render → setTasks → context change → re-render → …
  useEffect(() => {
    for (const msg of messages) {
      if (msg.type !== "ai") continue;
      for (const toolCall of msg.tool_calls ?? []) {
        if (toolCall.name === "task") {
          updateSubtask({
            id: toolCall.id!,
            subagent_type: toolCall.args.subagent_type,
            description: toolCall.args.description,
            prompt: toolCall.args.prompt,
            status: "in_progress",
          });
        }
      }
    }
  }, [messages, updateSubtask]);

  if (thread.isThreadLoading && messages.length === 0) {
    return <MessageListSkeleton />;
  }

  return (
    <Conversation className={cn("relative flex size-full flex-col", className)}>
      <ConversationContent className="mx-auto w-full max-w-(--chat-message-width) gap-5 pt-6">
        <LoadMoreHistoryIndicator
          isLoading={isHistoryLoading}
          hasMore={hasMoreHistory}
          loadMore={loadMoreHistory}
        />
        {groupMessages(
          messages,
          (group) => {
            if (group.type === "human") {
              return group.messages.map((msg) => (
                <MessageItem
                  key={`${group.id}/${msg.id}`}
                  threadId={threadId}
                  message={msg}
                  contextMessages={messages}
                  isLoading={
                    msg.id != null && msg.id === streamingMessageId
                  }
                  onEditMessage={handleEditMessage}
                />
              ));
            }
            if (group.type === "assistant") {
              // Only render AI messages as primary content. Orphan tool
              // messages that were pushed into this group by the fallback
              // in groupMessages are skipped — their results are surfaced
              // inside ToolGroup entries via findToolCallResult.
              return group.messages
                .filter((msg) => msg.type === "ai")
                .map((msg) => (
                  <MessageItem
                    key={`${group.id}/${msg.id}`}
                    threadId={threadId}
                    message={msg}
                    contextMessages={messages}
                    isLoading={
                      msg.id != null && msg.id === streamingMessageId
                    }
                    onEditMessage={handleEditMessage}
                  />
                ));
            }
            if (group.type === "assistant:processing") {
              // Intermediate AI messages — reasoning, prose chunks and tool
              // calls — parsed into ONE execution-order segment stream so
              // consecutive tool calls across messages merge into a single
              // ToolGroup row per prose gap. Tool-result messages are
              // skipped because their content is resolved into the steps
              // via findToolCallResult(contextMessages).
              return (
                <ProcessingFlow
                  key={group.id}
                  groupMessages={group.messages}
                  contextMessages={messages}
                  threadId={threadId}
                  isLoading={group.messages.some(
                    (msg) => msg.id != null && msg.id === streamingMessageId,
                  )}
                />
              );
            }
            if (group.type === "assistant:clarification") {
              const message = group.messages[0];
              if (!message) return null;
              // Extract the structured HumanInputRequest from the tool
              // message artifact. If found, render an interactive card;
              // otherwise fall back to plain markdown text.
              const request = extractHumanInputRequest(message);
              if (request) {
                return (
                  <div key={group.id} className="w-full">
                    <HumanInputCard
                      request={request}
                      onSubmit={onHumanInputSubmit}
                      answeredResponse={
                        answeredResponses.get(request.request_id) ?? null
                      }
                    />
                  </div>
                );
              }
              if (hasContent(message)) {
                return (
                  <div key={group.id} className="w-full">
                    <MarkdownContent
                      content={extractContentFromMessage(message)}
                      isLoading={thread.isLoading}
                      className="streamdown-tight"
                    />
                  </div>
                );
              }
              return null;
            }
            if (group.type === "assistant:present-files") {
              const files: string[] = [];
              for (const message of group.messages) {
                if (hasPresentFiles(message)) {
                  files.push(...extractPresentFilesFromMessage(message));
                }
              }
              // HTML 报告在对话流内联预览（图文并茂、可全屏），
              // 其余交付文件仍以文件卡片列表展示。
              const htmlReports = files.filter(
                (file) => checkCodeFile(file).language === "html",
              );
              const otherFiles = files.filter(
                (file) => checkCodeFile(file).language !== "html",
              );
              return (
                <div className="w-full" key={group.id}>
                  {group.messages[0] && hasContent(group.messages[0]) && (
                    <MarkdownContent
                      content={extractContentFromMessage(group.messages[0])}
                      isLoading={thread.isLoading}
                      className="streamdown-tight mb-4"
                    />
                  )}
                  {htmlReports.length > 0 && (
                    <div className="mb-4 flex flex-col gap-3">
                      {htmlReports.map((file) => (
                        <ReportCard
                          key={file}
                          filepath={file}
                          threadId={threadId}
                        />
                      ))}
                    </div>
                  )}
                  {otherFiles.length > 0 && (
                    <ArtifactFileList files={otherFiles} threadId={threadId} />
                  )}
                </div>
              );
            }
            if (group.type === "assistant:subagent") {
              // Subtask definitions are registered into context via the
              // useEffect above — NOT during render (which would cause an
              // infinite loop via setTasks).
              const results: React.ReactNode[] = [];
              for (const message of group.messages) {
                if (message.type === "ai") {
                  const taskIds = message.tool_calls
                    ?.filter((toolCall) => toolCall.name === "task")
                    .map((toolCall) => toolCall.id);
                  for (const taskId of taskIds ?? []) {
                    results.push(
                      <SubtaskCard
                        key={"task-group-" + taskId}
                        taskId={taskId!}
                        isLoading={thread.isLoading}
                      />,
                    );
                  }
                }
              }
              return (
                <div
                  key={"subtask-group-" + group.id}
                  className="relative z-1 flex flex-col gap-2"
                >
                  {results}
                </div>
              );
            }
            return null;
          },
          { isCurrentTurnLoading: thread.isLoading },
        )}
        {/* Regenerate the last turn: removes everything after the latest
            user message and re-runs the model against it. Only offered
            when the thread is idle and there is a turn to redo. */}
        {canRegenerate && (
          <div className="flex">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground gap-1.5 rounded-full px-3"
              onClick={handleRegenerate}
            >
              <RefreshCwIcon className="size-3.5" />
              重新生成
            </Button>
          </div>
        )}
        {/* Persistent loading indicator: stays visible for the entire
            duration of a turn, regardless of which segment type is
            currently being rendered, so the user always sees motion
            until the turn completes. */}
        {thread.isLoading && (
          <div className="flex items-center gap-2 px-1 text-muted-foreground text-sm">
            <NeuralWaveSpinner />
            <span>处理中…</span>
          </div>
        )}
        <div style={{ height: `${paddingBottom}px` }} />
      </ConversationContent>

      {/* Floating "scroll to bottom" button — a direct child of
          Conversation (StickToBottom) so it stays pinned to the visible
          viewport instead of riding with the scroll content. It reads
          isAtBottom from the library context, which reflects the real
          scroll container (our own onScroll would never fire because the
          actual scrolling element is internal to the library). */}
      <ScrollToBottomButton />
    </Conversation>
  );
}

/**
 * ProcessingFlow — renders one `assistant:processing` group as a single
 * execution-order segment stream. Tool calls that are adjacent across the
 * group's AI messages (no prose between them) merge into one ToolGroup,
 * so each prose gap shows exactly one collapsible tool summary row.
 */
function ProcessingFlow({
  groupMessages,
  contextMessages,
  threadId,
  isLoading,
}: {
  groupMessages: Message[];
  contextMessages: Message[];
  threadId: string;
  isLoading: boolean;
}) {
  const segments = useMemo(
    () => parseAssistantSegments(groupMessages, contextMessages),
    [groupMessages, contextMessages],
  );

  return (
    <div className="group/conversation-message flex w-full flex-col gap-3.5">
      <SegmentList
        segments={segments}
        threadId={threadId}
        isLoading={isLoading}
      />
    </div>
  );
}

/** Floating "back to bottom" button driven by the stick-to-bottom lib. */
function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  return (
    <div className="pointer-events-none absolute bottom-32 left-0 right-0 flex justify-center">
      <button
        type="button"
        aria-label="回到底部"
        title="回到底部"
        onClick={() => {
          void scrollToBottom({ animation: "smooth" });
        }}
        className={cn(
          "pointer-events-auto z-20 flex h-9 w-9 items-center justify-center rounded-full border shadow-md backdrop-blur",
          "bg-background/90 hover:bg-background border-border/70 text-muted-foreground hover:text-foreground",
          "transition-all duration-200 hover:-translate-y-0.5",
        )}
      >
        <ChevronDownIcon className="size-4" />
      </button>
    </div>
  );
}

function LoadMoreHistoryIndicator({
  isLoading,
  hasMore,
  loadMore,
}: {
  isLoading?: boolean;
  hasMore?: boolean;
  loadMore?: () => void;
}) {
  const { t } = useI18n();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadRef = useRef(0);

  const throttledLoadMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    const now = Date.now();
    const remaining =
      LOAD_MORE_HISTORY_THROTTLE_MS - (now - lastLoadRef.current);
    if (remaining <= 0) {
      lastLoadRef.current = now;
      loadMore?.();
      return;
    }
    if (timeoutRef.current) return;
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      if (!hasMore || isLoading) return;
      lastLoadRef.current = Date.now();
      loadMore?.();
    }, remaining);
  }, [hasMore, isLoading, loadMore]);

  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) throttledLoadMore();
      },
      { rootMargin: "120px 0px 0px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, throttledLoadMore]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!hasMore && !isLoading) return null;

  return (
    <div ref={sentinelRef} className="flex w-full justify-center">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground rounded-full px-3"
        disabled={(isLoading ?? false) || !hasMore}
        onClick={throttledLoadMore}
      >
        {isLoading ? (
          <>
            <Loader2Icon className="mr-2 size-4 animate-spin" />
            {t.common.loading}
          </>
        ) : (
          <>
            <ChevronUpIcon className="mr-2 size-4" />
            {t.common.loadMore}
          </>
        )}
      </Button>
    </div>
  );
}
