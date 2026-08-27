// web-demo/tests/unit/components/better-sidebar/PdfViewer.test.tsx
// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { PdfViewer } from "@/components/better-sidebar/viewers/PdfViewer";

vi.mock("pdfjs-dist", () => ({
  getDocument: () => ({ promise: Promise.resolve({ numPages: 0 }) }),
  GlobalWorkerOptions: { workerSrc: "" },
}));

describe("PdfViewer", () => {
  test("renders loading placeholder initially", () => {
    const { container } = render(
      <PdfViewer
        entry={{ name: "x.pdf", type: "file", size: 1, mtime: 0, mime: "application/pdf" }}
        content={new Uint8Array()}
        scope={{ threadId: "thr" }}
      />,
    );
    expect(container.textContent).toMatch(/loading|pdf/i);
  });
});
