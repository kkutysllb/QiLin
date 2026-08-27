// web-demo/tests/unit/components/better-sidebar/HtmlViewer.test.tsx
// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { HtmlViewer } from "@/components/better-sidebar/viewers/HtmlViewer";

describe("HtmlViewer", () => {
  test("renders sandboxed iframe with srcdoc", () => {
    const { container } = render(
      <HtmlViewer
        entry={{ name: "x.html", type: "file", size: 0, mtime: 0, mime: "text/html" }}
        content="<h1>x</h1>"
        scope={{ threadId: "thr" }}
      />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("sandbox")).toContain("allow-same-origin");
    expect(iframe?.getAttribute("srcdoc")).toContain("h1");
  });
});
