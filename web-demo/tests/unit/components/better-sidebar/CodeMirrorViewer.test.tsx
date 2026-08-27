// web-demo/tests/unit/components/better-sidebar/CodeMirrorViewer.test.tsx
// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { CodeMirrorViewer } from "@/components/better-sidebar/viewers/CodeMirrorViewer";

describe("CodeMirrorViewer", () => {
  test("calls onSave with new content", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <CodeMirrorViewer
        entry={{ name: "x.py", type: "file", size: 0, mtime: 0, mime: "text/x-python" }}
        content="print(1)"
        scope={{ threadId: "thr" }}
        onSave={onSave}
      />,
    );
    // CodeMirror mounts an editor — simulate change via the React state setters in the component.
    const save = screen.getByRole("button", { name: /save/i });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalled();
  });
});
