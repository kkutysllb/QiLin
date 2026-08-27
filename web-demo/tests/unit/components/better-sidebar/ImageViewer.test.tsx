// web-demo/tests/unit/components/better-sidebar/ImageViewer.test.tsx
// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ImageViewer } from "@/components/better-sidebar/viewers/ImageViewer";

describe("ImageViewer", () => {
  test("renders <img> with object URL when given Uint8Array", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = () => undefined;
    const { container } = render(
      <ImageViewer
        entry={{ name: "x.png", type: "file", size: 4, mtime: 0, mime: "image/png" }}
        content={bytes}
        scope={{ threadId: "thr" }}
      />,
    );
    expect(container.querySelector("img")).toBeTruthy();
  });
});
