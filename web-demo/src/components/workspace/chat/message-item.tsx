"use client";

import type { Message } from "@langchain/langgraph-sdk";
import { memo, useMemo } from "react";

import { parseMessageSegments, parseUserPrompt } from "@/core/messages/segments";
import { cn } from "@/lib/utils";

import { SegmentList } from "./segments/segment-list";
import { UserPrompt } from "./segments/user-prompt";

interface MessageItemProps {
  message: Message;
  contextMessages: Message[];
  threadId: string;
  isLoading?: boolean;
  /** Called when the user edits + saves a human message. */
  onEditMessage?: (messageId: string, replacementText: string) => void;
  className?: string;
}

/**
 * MessageItem — the single-message shell (Layer 1).
 *
 * Human messages render as a {@link UserPrompt}; assistant messages are
 * decomposed by {@link parseMessageSegments} into segments in execution
 * order (reasoning, then prose and tool activity interleaved as the model
 * produced them) and rendered via {@link SegmentList}.
 */
export const MessageItem = memo(
  function MessageItem({
    message,
    contextMessages,
    threadId,
    isLoading = false,
    onEditMessage,
    className,
  }: MessageItemProps) {
    const isHuman = message.type === "human";

    // Memoize segment parsing — during SSE streaming, the parent re-renders
    // on every token. Without this, parseMessageSegments re-parses every
    // message in the list each tick (O(n²) with contextMessages scanning
    // for tool results), which freezes the UI on long conversations.
    const segments = useMemo(
      () =>
        isHuman ? [] : parseMessageSegments(message, contextMessages),
      [isHuman, message, contextMessages],
    );

    if (isHuman) {
      const prompt = parseUserPrompt(message);
      return (
        <div
          className={cn("group/conversation-message flex w-full", className)}
        >
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
        </div>
      </div>
    );
  },
);
