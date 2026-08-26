import type { AIMessage, Message } from "@langchain/langgraph-sdk";
import { describe, expect, test } from "vitest";

import {
  parseAssistantSegments,
  parseMessageSegments,
  parseUserPrompt,
} from "@/core/messages/segments";

type AIMessageLike = Partial<Omit<AIMessage, "type">> & { id: string };

function aiMessage(partial: AIMessageLike): Message {
  return { type: "ai", ...partial } as unknown as Message;
}

function toolResult(id: string, content: string): Message {
  return {
    type: "tool",
    id: `result-${id}`,
    tool_call_id: id,
    content,
  } as unknown as Message;
}

describe("parseMessageSegments — execution-order interleaving", () => {
  test("string content renders prose BEFORE its tool calls", () => {
    const message = aiMessage({
      id: "m1",
      content: "我先看一下文件结构",
      tool_calls: [
        { id: "call-1", name: "read_file", args: { file_path: "a.ts" } },
      ],
    });

    const segments = parseMessageSegments(message);
    const kinds = segments.map((s) => s.kind);

    expect(kinds).toEqual(["prose", "tool_activity"]);
  });

  test("block content keeps the model's text/tool interleaving", () => {
    const message = aiMessage({
      id: "m2",
      content: [
        { type: "text", text: "第一步" },
        { type: "tool_call", id: "tc-1", name: "bash", args: { command: "ls" } },
        { type: "text", text: "第二步" },
        { type: "tool_call", id: "tc-2", name: "grep", args: { pattern: "x" } },
      ] as unknown as Message["content"],
    });

    const segments = parseMessageSegments(message);
    const kinds = segments.map((s) => s.kind);

    expect(kinds).toEqual(["prose", "tool_activity", "prose", "tool_activity"]);
    expect(segments[0]).toMatchObject({ kind: "prose", content: "第一步" });
    expect(segments[2]).toMatchObject({ kind: "prose", content: "第二步" });
  });

  test("tool_use blocks (Anthropic style) resolve calls and interleave", () => {
    const message = aiMessage({
      id: "m3",
      content: [
        { type: "text", text: "查一下" },
        { type: "tool_use", id: "tu-1", name: "web_search", input: { query: "q" } },
      ] as unknown as Message["content"],
    });

    const segments = parseMessageSegments(message, [
      toolResult("tu-1", JSON.stringify({ results: [] })),
    ]);

    expect(segments.map((s) => s.kind)).toEqual(["prose", "tool_activity"]);
    const steps = segments[1]?.kind === "tool_activity" ? segments[1].steps : [];
    expect(steps[0]).toMatchObject({
      id: "tu-1",
      name: "web_search",
      result: { results: [] },
    });
  });

  test("tool_calls not present as content blocks render after the text", () => {
    const message = aiMessage({
      id: "m4",
      content: [{ type: "text", text: "正文" }] as unknown as Message["content"],
      tool_calls: [
        { id: "call-9", name: "bash", args: { command: "pwd" } },
      ],
    });

    const segments = parseMessageSegments(message);
    expect(segments.map((s) => s.kind)).toEqual(["prose", "tool_activity"]);
  });

  test("consecutive tool calls merge into one activity block", () => {
    const message = aiMessage({
      id: "m5",
      content: [
        { type: "tool_call", id: "t1", name: "read_file", args: { file_path: "x" } },
        { type: "tool_call", id: "t2", name: "write_file", args: { file_path: "y" } },
      ] as unknown as Message["content"],
    });

    const segments = parseMessageSegments(message);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe("tool_activity");
    if (segments[0]?.kind === "tool_activity") {
      expect(segments[0].steps.map((s) => s.id)).toEqual(["t1", "t2"]);
    }
  });

  test("reasoning comes first, deferred tools are skipped", () => {
    const message = aiMessage({
      id: "m6",
      content: "正文",
      additional_kwargs: {
        reasoning_content: "思考过程",
      },
      tool_calls: [
        { id: "task-1", name: "task", args: { prompt: "sub" } },
        { id: "call-2", name: "bash", args: { command: "ls" } },
      ],
    });

    const segments = parseMessageSegments(message);
    const kinds = segments.map((s) => s.kind);

    expect(kinds).toEqual(["reasoning", "prose", "tool_activity"]);
    if (segments[2]?.kind === "tool_activity") {
      expect(segments[2].steps.map((s) => s.name)).toEqual(["bash"]);
    }
  });
});

describe("parseAssistantSegments — cross-message ToolGroup aggregation", () => {
  test("tool calls adjacent across messages merge into one group per prose gap", () => {
    const ai1 = aiMessage({
      id: "a1",
      content: "我先看一下结构",
      tool_calls: [
        { id: "t1", name: "read_file", args: { file_path: "x.ts" } },
      ],
    });
    // tools-only follow-up message — same prose gap as ai1's calls
    const ai2 = aiMessage({
      id: "a2",
      content: "",
      tool_calls: [{ id: "t2", name: "bash", args: { command: "ls" } }],
    });
    const ai3 = aiMessage({
      id: "a3",
      content: "找到了。现在写入结果",
      tool_calls: [
        { id: "t3", name: "write_file", args: { file_path: "y.ts" } },
      ],
    });

    const segments = parseAssistantSegments([ai1, ai2, ai3]);
    const kinds = segments.map((s) => s.kind);

    // One group between the two prose chunks, another after the last one.
    expect(kinds).toEqual(["prose", "tool_activity", "prose", "tool_activity"]);
    if (segments[1]?.kind === "tool_activity") {
      expect(segments[1].steps.map((s) => s.id)).toEqual(["t1", "t2"]);
    }
    if (segments[3]?.kind === "tool_activity") {
      expect(segments[3].steps.map((s) => s.id)).toEqual(["t3"]);
    }
  });

  test("non-ai messages in the group are ignored", () => {
    const ai1 = aiMessage({
      id: "a1",
      content: "正文",
      tool_calls: [{ id: "t1", name: "bash", args: { command: "ls" } }],
    });
    const toolMsg = {
      type: "tool",
      id: "r1",
      tool_call_id: "t1",
      content: "ok",
    } as unknown as Message;

    const segments = parseAssistantSegments([ai1, toolMsg]);
    expect(segments.map((s) => s.kind)).toEqual(["prose", "tool_activity"]);
  });
});

describe("parseUserPrompt — screenshot / upload bubble sanitization", () => {
  const PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

  function humanMessage(
    partial: Partial<Message> & { content: unknown },
  ): Message {
    return { type: "human", id: "h1", ...partial } as unknown as Message;
  }

  test("strips the <current_uploads> block UploadsMiddleware prepended to the persisted message", () => {
    // Mirrors UploadsMiddleware: a files text block is prepended before the
    // user's own text blocks, then the whole message streams back via values.
    const message = humanMessage({
      content: [
        {
          type: "text",
          text: "<current_uploads>\nThe following files were uploaded in this message:\n\n- image.png (343.8 KB)\n  Path: /mnt/user-data/uploads/image.png\n  Use `grep` to search for keywords (e.g. `grep(pattern='keyword', path='/mnt/user-data/uploads/')`).\n\n</current_uploads>\n\n",
        },
        { type: "text", text: "各新闻分布面板是空白" },
      ],
      additional_kwargs: {
        files: [
          {
            filename: "image.png",
            size: 351641,
            path: "/data/threads/t1/uploads/image.png",
            status: "uploaded",
          },
        ],
      },
    });

    const prompt = parseUserPrompt(message);

    expect(prompt.content).toBe("各新闻分布面板是空白");
    expect(prompt.files).toHaveLength(1);
    expect(prompt.images).toEqual([]);
  });

  test("strips <current_uploads> from string content too", () => {
    const message = humanMessage({
      content:
        "<current_uploads>\n(empty)\n\n</current_uploads>\n\n各新闻分布面板是空白",
    });

    const prompt = parseUserPrompt(message);

    expect(prompt.content).toBe("各新闻分布面板是空白");
  });

  test("image_url blocks become thumbnail entries instead of base64 markdown text", () => {
    const message = humanMessage({
      content: [
        { type: "text", text: "看看这张截图" },
        { type: "image_url", image_url: { url: PNG_DATA_URL } },
      ],
    });

    const prompt = parseUserPrompt(message);

    expect(prompt.content).toBe("看看这张截图");
    expect(prompt.images).toEqual([PNG_DATA_URL]);
  });

  test("https image URLs are lifted out while other schemes stay as text", () => {
    const message = humanMessage({
      content: [
        {
          type: "text",
          text: "看看这张截图\n![image](javascript:alert(1))",
        },
        { type: "image_url", image_url: { url: "https://example.com/a.png" } },
      ],
    });

    const prompt = parseUserPrompt(message);

    expect(prompt.content).toContain("javascript:alert(1)");
    expect(prompt.images).toEqual(["https://example.com/a.png"]);
  });

  test("image-only message yields empty text so the bubble is skipped", () => {
    const message = humanMessage({
      content: [
        {
          type: "text",
          text: "<current_uploads>\n- image.png\n</current_uploads>\n\n",
        },
        { type: "image_url", image_url: { url: PNG_DATA_URL } },
      ],
    });

    const prompt = parseUserPrompt(message);

    expect(prompt.content).toBe("");
    expect(prompt.images).toEqual([PNG_DATA_URL]);
  });
});
