// web-demo/tests/unit/components/better-sidebar/MarkdownViewer.test.tsx
// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { MarkdownViewer } from "@/components/better-sidebar/viewers/MarkdownViewer";

describe("MarkdownViewer", () => {
  test("renders inline markdown to HTML", () => {
    render(
      <MarkdownViewer
        entry={{ name: "x.md", type: "file", size: 6, mtime: 0, mime: "text/markdown" }}
        content={"# hello"}
        scope={{ threadId: "thr" }}
      />,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toBeTruthy();
    expect(heading.textContent).toBe("hello");
  });

  test("renders Mermaid code blocks as <pre class=\"mermaid\">", () => {
    render(
      <MarkdownViewer
        entry={{ name: "x.md", type: "file", size: 0, mtime: 0, mime: "text/markdown" }}
        content={"```mermaid\ngraph TD; A-->B;\n```"}
        scope={{ threadId: "thr" }}
      />,
    );
    expect(document.querySelector("pre.mermaid")).toBeTruthy();
  });
});
