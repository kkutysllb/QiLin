// web-demo/tests/unit/core/sidebar/protocol-types.test.ts
import { describe, expect, test } from "vitest";

import type {
  SidebarPanelSpec, SidebarPanelProps, SidebarScope,
  FileViewerSpec, FileViewerProps, SidebarTabState,
} from "@/core/sidebar/protocol";

describe("protocol types compile & sanity", () => {
  test("SidebarPanelSpec accepts a render fn", () => {
    const spec: SidebarPanelSpec<{ path: string }> = {
      id: "x:y",
      title: "Y",
      render: ({ payload }) => payload.path,
    };
    expect(spec.id).toBe("x:y");
  });

  test("FileViewerSpec optional editable", () => {
    const v: FileViewerSpec = { id: "v", exts: [".md"], component: () => null };
    expect(v.editable).toBeUndefined();
  });

  test("SidebarScope carries threadId", () => {
    const s: SidebarScope = { threadId: "thr-1" };
    expect(s.threadId).toBe("thr-1");
  });

  test("SidebarTabState split default is single", () => {
    const t: SidebarTabState = { tabs: [], active: null, split: "single" };
    expect(t.split).toBe("single");
  });
});
