import type { Message } from "@langchain/langgraph-sdk";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ToolGroup } from "@/components/workspace/chat/segments/tool-group";
import { parseMessageSegments } from "@/core/messages/segments";

function aiToolMessage(toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>): Message {
  return {
    type: "ai",
    id: "m1",
    content: "我先处理一下",
    tool_calls: toolCalls.map((tc) => ({ ...tc })),
  } as unknown as Message;
}

function firstToolSteps(message: Message) {
  const segments = parseMessageSegments(message);
  const toolSegment = segments.find((s) => s.kind === "tool_activity");
  return toolSegment?.kind === "tool_activity" ? toolSegment.steps : [];
}

describe("ToolGroup — one collapsed row per prose gap", () => {
  test("multiple tool calls are wrapped, collapsed, with Chinese labels", () => {
    const message = aiToolMessage([
      { id: "c1", name: "write_file", args: { file_path: "src/app/page.tsx" } },
      { id: "c2", name: "bash", args: { command: "python render.py" } },
    ]);
    const html = renderToStaticMarkup(
      createElement(ToolGroup, { steps: firstToolSteps(message) }),
    );

    // Summary row shows the call count + Chinese tool labels.
    expect(html).toContain("2 个工具调用");
    expect(html).toContain("写入文件");
    expect(html).toContain("执行命令");
    // Raw tool names are not shown in the collapsed summary.
    expect(html).not.toContain(">write_file<");
    expect(html).not.toContain(">bash<");
    // Collapsed by default — per-step rows and details are not rendered.
    expect(html).not.toContain("参数");
    expect(html).not.toContain("执行结果");
  });

  test("a single tool call is wrapped the same way", () => {
    const message = aiToolMessage([
      { id: "c1", name: "bash", args: { command: "ls -la" } },
    ]);
    const html = renderToStaticMarkup(
      createElement(ToolGroup, { steps: firstToolSteps(message) }),
    );

    // Summary shows the Chinese label + primary argument, not raw details.
    expect(html).toContain("执行命令");
    expect(html).toContain("ls -la");
    expect(html).not.toContain("执行结果");
    // The expand affordance is present.
    expect(html).toContain("aria-expanded=\"false\"");
  });

  test("unknown MCP tools fall back to a readable label", () => {
    const message = aiToolMessage([
      { id: "c1", name: "mcp__node_repl__run_js", args: { code: "1+1" } },
    ]);
    const html = renderToStaticMarkup(
      createElement(ToolGroup, { steps: firstToolSteps(message) }),
    );

    expect(html).toContain("run js");
    expect(html).not.toContain("mcp__node_repl__run_js");
  });

  test("prose renders before tool activity for string content", () => {
    const message = aiToolMessage([
      { id: "c1", name: "bash", args: { command: "ls" } },
    ]);
    const segments = parseMessageSegments(message);

    expect(segments.map((s) => s.kind)).toEqual(["prose", "tool_activity"]);
  });
});
