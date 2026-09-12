import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, test, vi } from "vitest";

import {
  areMessageItemPropsEqual,
  type MessageItemProps,
} from "@/components/workspace/chat/message-item";

const message = {
  id: "human-1",
  type: "human",
  content: "hello",
} as Message;

describe("MessageItem props comparison", () => {
  test("ignores a new contextMessages array for a completed message", () => {
    const onEditMessage = vi.fn();
    const base: MessageItemProps = {
      message,
      contextMessages: [message],
      threadId: "thread-1",
      isLoading: false,
      onEditMessage,
    };

    expect(
      areMessageItemPropsEqual(base, {
        ...base,
        contextMessages: [message],
      }),
    ).toBe(true);
  });

  test("rerenders an active message when its message object changes", () => {
    const base: MessageItemProps = {
      message,
      contextMessages: [message],
      threadId: "thread-1",
      isLoading: true,
    };

    expect(
      areMessageItemPropsEqual(base, {
        ...base,
        message: { ...message, content: "new token" } as Message,
      }),
    ).toBe(false);
  });

  test("rerenders a completed message when its message object changes", () => {
    const base: MessageItemProps = {
      message,
      contextMessages: [message],
      threadId: "thread-1",
      isLoading: false,
    };

    expect(
      areMessageItemPropsEqual(base, {
        ...base,
        message: { ...message, content: "final content" } as Message,
      }),
    ).toBe(false);
  });
});
