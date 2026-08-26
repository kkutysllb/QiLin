import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, test } from "vitest";


import {
  buildEditResubmitMessages,
  buildRegenerateMessages,
} from "@/core/threads/regenerate";

function human(id: string, content: string, extra: Partial<Message> = {}): Message {
  return { type: "human", id, content, ...extra } as unknown as Message;
}

function ai(id: string, content: string): Message {
  return { type: "ai", id, content } as unknown as Message;
}

function tool(id: string): Message {
  return { type: "tool", id, tool_call_id: id, content: "ok" } as unknown as Message;
}

function hiddenReminder(id: string): Message {
  return {
    type: "human",
    id,
    content: "reminder",
    name: "todo_reminder",
    additional_kwargs: { hide_from_ui: true },
  } as unknown as Message;
}

describe("buildRegenerateMessages", () => {
  test("removes everything after the last visible human message", () => {
    const messages = [
      human("h1", "问题一"),
      ai("a1", "回答一"),
      human("h2", "问题二"),
      ai("a2", "回答二a"),
      tool("t1"),
    ];

    const input = buildRegenerateMessages(messages)!;

    expect(input).toHaveLength(2);
    expect(input.map((m) => (m as { id: string }).id)).toEqual(["a2", "t1"]);
    expect((input[0] as unknown as { role: string }).role).toBe("remove");
  });

  test("skips hidden human messages when choosing the anchor", () => {
    const messages = [
      human("h1", "问题"),
      ai("a1", "回答"),
      hiddenReminder("r1"),
    ];

    // The hidden reminder is still a human message, but the anchor must be
    // the visible one — everything after h1 (including r1) is removed.
    const input = buildRegenerateMessages(messages)!;
    expect(input.map((m) => (m as { id: string }).id)).toEqual(["a1", "r1"]);
  });

  test("returns null when there is nothing to regenerate", () => {
    expect(buildRegenerateMessages([human("h1", "问题")])).toBeNull();
    expect(buildRegenerateMessages([])).toBeNull();
  });
});

describe("buildEditResubmitMessages", () => {
  test("removes trailing messages and replaces the human message in place", () => {
    const messages = [
      human("h1", "问题一"),
      ai("a1", "回答一"),
      human("h2", "问题二", { additional_kwargs: { files: [] } }),
      ai("a2", "回答二"),
      tool("t1"),
    ];

    const input = buildEditResubmitMessages(messages, "h2", "改后的问题二")!;

    // removals first, then the updated human message with the same id
    expect(input).toHaveLength(3);
    expect((input[0] as unknown as { role: string }).role).toBe("remove");
    expect((input[1] as unknown as { role: string }).role).toBe("remove");
    const updated = input[2] as unknown as Message & { content: string };
    expect(updated.id).toBe("h2");
    expect(updated.type).toBe("human");
    expect(updated.content).toBe("改后的问题二");
  });

  test("returns null for unknown ids or empty replacement", () => {
    const messages = [human("h1", "问题")];
    expect(buildEditResubmitMessages(messages, "nope", "text")).toBeNull();
    expect(buildEditResubmitMessages(messages, "h1", "   ")).toBeNull();
  });
});
