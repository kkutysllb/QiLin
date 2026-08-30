"use client";

import { MessageFeed } from "@/components/workspace/chat/message-feed";

import type { ChatPageController } from "./use-chat-page-controller";

export interface ChatPageMessageListProps {
  controller: ChatPageController;
  /** MessageFeed 类名（两页的 isNewThread 顶距差异由页面显式给出）。 */
  className?: string;
}

/**
 * MessageFeed 的共享装配：历史分页 / human-input / 分支回调统一从
 * controller 绑定，页面只负责布局容器与 className。
 */
export function ChatPageMessageList({
  controller,
  className,
}: ChatPageMessageListProps) {
  return (
    <MessageFeed
      className={className}
      threadId={controller.threadId}
      thread={controller.thread}
      hasMoreHistory={controller.hasMoreHistory}
      loadMoreHistory={controller.loadMoreHistory}
      isHistoryLoading={controller.isHistoryLoading}
      onHumanInputSubmit={controller.handleHumanInputSubmit}
      onBranchThread={controller.handleBranchThread}
    />
  );
}
