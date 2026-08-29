import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, test } from "vitest";

import {
  formatAssistantTime,
  getAssistantPresentationMetadata,
  getVisibleAssistantText,
} from "@/core/messages/rendering";
import type { MessageSegment } from "@/core/messages/segments";

function aiMessage(fields: Record<string, unknown>): Message {
  return { type: "ai", content: "", ...fields } as unknown as Message;
}

describe("assistant message rendering helpers", () => {
  test("copies prose in order and excludes reasoning, tools, and files", () => {
    const segments: MessageSegment[] = [
      { kind: "reasoning", content: "内部思考" },
      { kind: "prose", content: "正文一" },
      { kind: "tool_activity", steps: [] },
      { kind: "prose", content: "正文二" },
      { kind: "files", files: [] },
    ];

    expect(getVisibleAssistantText(segments)).toBe("正文一\n\n正文二");
    expect(
      getVisibleAssistantText([{ kind: "reasoning", content: "仅思考" }]),
    ).toBe("");
  });

  test("reads reliable timestamp, model, and token metadata", () => {
    const message = aiMessage({
      metadata: { created_at: "2025-01-01T00:00:00.000Z" },
      response_metadata: { model_name: "model-a" },
      usage_metadata: { input_tokens: 20, output_tokens: 22, total_tokens: 42 },
    });

    expect(getAssistantPresentationMetadata(message)).toEqual({
      timestamp: Date.parse("2025-01-01T00:00:00.000Z"),
      model: "model-a",
      totalTokens: 42,
    });
  });

  test("returns no fabricated metadata for missing or invalid values", () => {
    const message = aiMessage({
      created_at: "not-a-date",
      response_metadata: { model_name: "" },
      usage_metadata: undefined,
    });

    expect(getAssistantPresentationMetadata(message)).toEqual({});
  });

  test("formats a timestamp using the requested locale", () => {
    expect(
      formatAssistantTime(Date.parse("2025-01-01T08:05:00.000Z"), "zh-CN"),
    ).toMatch(/\d{1,2}:\d{2}/);
  });
});
