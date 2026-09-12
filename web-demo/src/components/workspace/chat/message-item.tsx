"use client";

import type { Message } from "@langchain/langgraph-sdk";
import { memo, useMemo } from "react";

import { getAssistantRunId } from "@/core/messages/rendering";
import {
  parseMessageSegments,
  parseUserPrompt,
} from "@/core/messages/segments";
import type { TurnDurations } from "@/core/messages/turn-timing";
import { cn } from "@/lib/utils";

import { AssistantMessageFooter } from "./assistant-message-footer";
import { SegmentList } from "./segments/segment-list";
import { UserPrompt } from "./segments/user-prompt";

export interface MessageItemProps {
  message: Message;
  contextMessages: Message[];
  threadId: string;
  isLoading?: boolean;
  /** Called when the user edits + saves a human message. */
  onEditMessage?: (messageId: string, replacementText: string) => void;
  onBranchThread?: () => Promise<void>;
  onRegenerate?: () => void;
  /** 本会话实测的 turn 总用时归档（runId → ms），供 footer 固定展示。 */
  turnDurations?: TurnDurations;
  className?: string;
}

export function areMessageItemPropsEqual(
  previous: MessageItemProps,
  next: MessageItemProps,
): boolean {
  if (previous.threadId !== next.threadId) return false;
  if (previous.message !== next.message) return false;
  if (previous.isLoading !== next.isLoading) return false;
  if (previous.isLoading || next.isLoading) return false;
  if (previous.className !== next.className) return false;
  if (previous.turnDurations !== next.turnDurations) return false;
  if (previous.onEditMessage !== next.onEditMessage) return false;
  if (previous.onBranchThread !== next.onBranchThread) return false;
  if (previous.onRegenerate !== next.onRegenerate) return false;

  // contextMessages is intentionally ignored. It is a new array on every
  // stream update, while the message itself is the render identity. The
  // active message already fails on message/isLoading changes and will be
  // re-rendered with the newest tool-result context.
  return true;
}

/**
 * MessageItem — the single-message shell (Layer 1).
 *
 * Human messages render as a {@link UserPrompt}; assistant messages are
 * decomposed by {@link parseMessageSegments} into segments in execution
 * order (reasoning, then prose and tool activity interleaved as the model
 * produced them) and rendered via {@link SegmentList}.
 */
export const MessageItem = memo(function MessageItem({
  message,
  contextMessages,
  threadId,
  isLoading = false,
  onEditMessage,
  onBranchThread,
  onRegenerate,
  turnDurations,
  className,
}: MessageItemProps) {
  const isHuman = message.type === "human";
  // Footer 的 runId / turn 用时共享一次解析结果，保证两处键一致。
  const runId = isHuman
    ? undefined
    : getAssistantRunId(contextMessages, message.id);

  // Memoize segment parsing — during SSE streaming, the parent re-renders
  // on every token. Without this, parseMessageSegments re-parses every
  // message in the list each tick (O(n²) with contextMessages scanning
  // for tool results), which freezes the UI on long conversations.
  const segments = useMemo(
    () => (isHuman ? [] : parseMessageSegments(message, contextMessages)),
    [isHuman, message, contextMessages],
  );

  if (isHuman) {
    const prompt = parseUserPrompt(message);
    return (
      <div className={cn("group/conversation-message flex w-full", className)}>
        <UserPrompt
          prompt={prompt}
          threadId={threadId}
          messageId={message.id}
          onEditMessage={onEditMessage}
        />
      </div>
    );
  }

  return (
    <div className={cn("group/conversation-message flex w-full", className)}>
      <div className="flex w-full flex-col gap-3.5">
        <SegmentList
          segments={segments}
          threadId={threadId}
          isLoading={isLoading}
        />
        <AssistantMessageFooter
          message={message}
          segments={segments}
          threadId={threadId}
          runId={runId}
          isLoading={isLoading}
          turnDurationMs={
            runId !== undefined ? turnDurations?.[runId] : undefined
          }
          onBranchThread={onBranchThread}
          onRegenerate={onRegenerate}
        />
      </div>
    </div>
  );
}, areMessageItemPropsEqual);
