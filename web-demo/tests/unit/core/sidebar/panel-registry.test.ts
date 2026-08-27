import { afterEach, describe, expect, test } from "vitest";
import { sidebarPanelRegistry } from "@/core/sidebar/panel-registry";
import type { SidebarPanelSpec } from "@/core/sidebar/protocol";

const SPEC_A: SidebarPanelSpec = { id: "x:a", title: "A", render: () => null, order: 20 };
const SPEC_B: SidebarPanelSpec = { id: "x:b", title: "B", render: () => null, order: 10 };

afterEach(() => {
  sidebarPanelRegistry.unregister("x:a");
  sidebarPanelRegistry.unregister("x:b");
});

describe("SidebarPanelRegistry", () => {
  test("register & unregister", () => {
    expect(sidebarPanelRegistry.list()).toHaveLength(0);
    sidebarPanelRegistry.register(SPEC_A);
    expect(sidebarPanelRegistry.get("x:a")).toBe(SPEC_A);
    sidebarPanelRegistry.unregister("x:a");
    expect(sidebarPanelRegistry.get("x:a")).toBeUndefined();
  });

  test("list is ordered by .order ascending", () => {
    sidebarPanelRegistry.register(SPEC_A);
    sidebarPanelRegistry.register(SPEC_B);
    expect(sidebarPanelRegistry.list().map((s) => s.id)).toEqual(["x:b", "x:a"]);
  });

  test("register returns disposer", () => {
    const dispose = sidebarPanelRegistry.register(SPEC_A);
    dispose();
    expect(sidebarPanelRegistry.get("x:a")).toBeUndefined();
  });

  test("register rejects duplicate id", () => {
    sidebarPanelRegistry.register(SPEC_A);
    expect(() => sidebarPanelRegistry.register(SPEC_A)).toThrow(/already registered/);
  });

  test("matchFileViewer picks by extension", () => {
    sidebarPanelRegistry.register({
      id: "x:md",
      title: "MD",
      render: () => null,
      fileViewer: { exts: [".md", ".markdown"] },
    });
    const found = sidebarPanelRegistry.matchFileViewer({ name: "x.md", type: "file", size: 0, mtime: 0, mime: null });
    expect(found?.id).toBe("x:md");
    sidebarPanelRegistry.unregister("x:md");
  });
});
