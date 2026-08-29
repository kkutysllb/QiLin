import type { AIMessage, Message } from "@langchain/langgraph-sdk";
import { describe, expect, test } from "vitest";

import {
  parseAssistantSegments,
  parseMessageSegments,
  parseUserPrompt,
} from "@/core/messages/segments";
import {
  hasReasoning,
  splitInlineReasoningInOrder,
} from "@/core/messages/utils";

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
        {
          type: "tool_call",
          id: "tc-1",
          name: "bash",
          args: { command: "ls" },
        },
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
        {
          type: "tool_use",
          id: "tu-1",
          name: "web_search",
          input: { query: "q" },
        },
      ] as unknown as Message["content"],
    });

    const segments = parseMessageSegments(message, [
      toolResult("tu-1", JSON.stringify({ results: [] })),
    ]);

    expect(segments.map((s) => s.kind)).toEqual(["prose", "tool_activity"]);
    const steps =
      segments[1]?.kind === "tool_activity" ? segments[1].steps : [];
    expect(steps[0]).toMatchObject({
      id: "tu-1",
      name: "web_search",
      result: { results: [] },
    });
  });

  test("tool_calls not present as content blocks render after the text", () => {
    const message = aiMessage({
      id: "m4",
      content: [
        { type: "text", text: "正文" },
      ] as unknown as Message["content"],
      tool_calls: [{ id: "call-9", name: "bash", args: { command: "pwd" } }],
    });

    const segments = parseMessageSegments(message);
    expect(segments.map((s) => s.kind)).toEqual(["prose", "tool_activity"]);
  });

  test("consecutive tool calls merge into one activity block", () => {
    const message = aiMessage({
      id: "m5",
      content: [
        {
          type: "tool_call",
          id: "t1",
          name: "read_file",
          args: { file_path: "x" },
        },
        {
          type: "tool_call",
          id: "t2",
          name: "write_file",
          args: { file_path: "y" },
        },
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

describe("parseMessageSegments — in-place thinking blocks", () => {
  test("block order thinking → text → tool_call → thinking → text is preserved", () => {
    const message = aiMessage({
      id: "m7",
      content: [
        { type: "thinking", thinking: "先拆解一下问题", signature: "sig-1" },
        { type: "text", text: "第一步" },
        {
          type: "tool_call",
          id: "tc-7",
          name: "bash",
          args: { command: "ls" },
        },
        { type: "reasoning", reasoning: "结果符合预期，继续" },
        { type: "text", text: "第二步" },
      ] as unknown as Message["content"],
      additional_kwargs: { reasoning_content: "kwargs 兜底思考" },
    });

    const segments = parseMessageSegments(message);

    expect(segments.map((s) => s.kind)).toEqual([
      "reasoning",
      "prose",
      "tool_activity",
      "reasoning",
      "prose",
    ]);
    expect(segments[0]).toMatchObject({
      kind: "reasoning",
      content: "先拆解一下问题",
    });
    expect(segments[1]).toMatchObject({ kind: "prose", content: "第一步" });
    if (segments[2]?.kind === "tool_activity") {
      expect(segments[2].steps.map((s) => s.id)).toEqual(["tc-7"]);
    }
    expect(segments[3]).toMatchObject({
      kind: "reasoning",
      content: "结果符合预期，继续",
    });
    expect(segments[4]).toMatchObject({ kind: "prose", content: "第二步" });
  });

  test("reasoning_content typed blocks and type-less thinking fields are recognized in order", () => {
    const message = aiMessage({
      id: "m8",
      content: [
        { type: "reasoning_content", reasoning_content: "kwarg 风格思考" },
        { thinking: "无 type 的思考块" },
        { type: "text", text: "正文" },
      ] as unknown as Message["content"],
    });

    const segments = parseMessageSegments(message);

    // Adjacent reasoning segments coalesce into one.
    expect(segments.map((s) => s.kind)).toEqual(["reasoning", "prose"]);
    expect(segments[0]).toMatchObject({
      kind: "reasoning",
      content: "kwarg 风格思考\n\n无 type 的思考块",
    });
    expect(segments[1]).toMatchObject({ kind: "prose", content: "正文" });
  });

  test("additional_kwargs.reasoning_content only prepends when no thinking is locatable", () => {
    const withBlocks = aiMessage({
      id: "m9",
      content: [
        { type: "text", text: "正文" },
        { type: "thinking", thinking: "块内思考" },
      ] as unknown as Message["content"],
      additional_kwargs: { reasoning_content: "kwargs 兜底思考" },
    });
    const segments = parseMessageSegments(withBlocks);
    expect(segments.map((s) => s.kind)).toEqual(["prose", "reasoning"]);
    expect(segments[0]).toMatchObject({ kind: "prose", content: "正文" });
    expect(segments[1]).toMatchObject({
      kind: "reasoning",
      content: "块内思考",
    });

    const withoutBlocks = aiMessage({
      id: "m10",
      content: "纯文本",
      additional_kwargs: { reasoning_content: "kwargs 兜底思考" },
    });
    expect(parseMessageSegments(withoutBlocks).map((s) => s.kind)).toEqual([
      "reasoning",
      "prose",
    ]);
  });
});

describe("parseMessageSegments — multiple inline <think> tags in string content", () => {
  test("prose/reasoning keep tag order; unclosed trailing tag stays safe", () => {
    const message = aiMessage({
      id: "m11",
      content:
        "前言\n<think>思考一</think>\n中间\n<think>思考二</think><think>未闭合的思考",
    });

    const segments = parseMessageSegments(message);

    expect(segments.map((s) => s.kind)).toEqual([
      "prose",
      "reasoning",
      "prose",
      "reasoning",
    ]);
    expect(segments[0]).toMatchObject({ kind: "prose", content: "前言" });
    expect(segments[1]).toMatchObject({ kind: "reasoning", content: "思考一" });
    expect(segments[2]).toMatchObject({ kind: "prose", content: "中间" });
    // The two adjacent reasoning runs (last one unclosed) coalesce.
    expect(segments[3]).toMatchObject({
      kind: "reasoning",
      content: "思考二\n\n未闭合的思考",
    });
  });

  test("splitInlineReasoningInOrder returns positionally ordered segments", () => {
    expect(
      splitInlineReasoningInOrder("a<think>x</think>b<think>y</think><think>z"),
    ).toEqual([
      { kind: "prose", content: "a" },
      { kind: "reasoning", content: "x" },
      { kind: "prose", content: "b" },
      { kind: "reasoning", content: "y" },
      { kind: "reasoning", content: "z" },
    ]);
    expect(splitInlineReasoningInOrder("no tags here")).toEqual([
      { kind: "prose", content: "no tags here" },
    ]);
    expect(splitInlineReasoningInOrder("")).toEqual([]);
  });
});

describe("hasReasoning — array content checks every block", () => {
  test("finds a thinking block positioned after the first entry", () => {
    const message = aiMessage({
      id: "m12",
      content: [
        { type: "text", text: "正文" },
        { type: "thinking", thinking: "后置思考" },
      ] as unknown as Message["content"],
    });
    expect(hasReasoning(message)).toBe(true);
  });

  test("recognizes reasoning and reasoning_content typed blocks", () => {
    const reasoning = aiMessage({
      id: "m13",
      content: [
        { type: "text", text: "正文" },
        { type: "reasoning", reasoning: "r" },
      ] as unknown as Message["content"],
    });
    const reasoningContent = aiMessage({
      id: "m14",
      content: [
        { type: "text", text: "正文" },
        { type: "reasoning_content", reasoning_content: "rc" },
      ] as unknown as Message["content"],
    });
    expect(hasReasoning(reasoning)).toBe(true);
    expect(hasReasoning(reasoningContent)).toBe(true);
  });

  test("plain text blocks do not count as reasoning", () => {
    const message = aiMessage({
      id: "m15",
      content: [
        { type: "text", text: "正文" },
        { type: "text", text: "更多正文" },
      ] as unknown as Message["content"],
    });
    expect(hasReasoning(message)).toBe(false);
  });
});
