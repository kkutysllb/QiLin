import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: string }) =>
    createElement("div", null, children),
}));

import { ReasoningBlock } from "@/components/workspace/chat/segments/reasoning-block";

test("ReasoningBlock renders a collapsible thinking summary", () => {
  const html = renderToStaticMarkup(
    createElement(ReasoningBlock, { content: "thinking text" }),
  );

  expect(html).toContain("已思考");
  // Collapsed by default — the summary row is present, body is hidden.
  expect(html).not.toContain("thinking text");
});

test("ReasoningBlock shows streaming label while streaming", () => {
  const html = renderToStaticMarkup(
    createElement(ReasoningBlock, { content: "streaming thoughts", isStreaming: true }),
  );

  expect(html).toContain("思考中");
  // Collapsed by default even while streaming — the user expands manually.
  expect(html).not.toContain("streaming thoughts");
  expect(html).toContain("aria-expanded=\"false\"");
});
