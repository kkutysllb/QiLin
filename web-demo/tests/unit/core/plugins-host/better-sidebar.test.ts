import { afterEach, describe, expect, test } from "vitest";

import {
  activateBs,
  betterSidebarService,
  getBsSnapshot,
  setDrawerOpen,
  toThreadRelPath,
} from "@/plugins-host/better-sidebar";
import { getPluginService } from "@/plugins-host/services";

const disposers: Array<() => void> = [];
function track(d: () => void): () => void {
  disposers.push(d);
  return d;
}

afterEach(() => {
  setDrawerOpen(false);
  for (const t of [...getBsSnapshot().tabs])
    betterSidebarService.closeTab(t.id);
  for (const d of disposers.splice(0)) d();
  activateBs(null);
});

describe("betterSidebar service (H4-c parity)", () => {
  test("git-panel probe: service is registered with a callable openTab", () => {
    const svc = getPluginService("betterSidebar") as
      | { openTab?: unknown }
      | undefined;
    expect(typeof svc?.openTab).toBe("function");
  });

  test("editor openTab: content seed opens the drawer and dedupes by path", () => {
    betterSidebarService.openTab({
      type: "editor",
      title: "a.md",
      path: "/ws/a.md",
      id: "editor:/ws/a.md",
    });
    let s = getBsSnapshot();
    expect(s.tabs).toHaveLength(1);
    expect(s.drawerOpen).toBe(true);
    expect(s.activeKey).toBe(s.tabs[0]?.key);
    // same path, different explicit id — editor dedupes by path (DSH builtin)
    betterSidebarService.openTab({
      type: "editor",
      title: "a.md",
      path: "/ws/a.md",
      id: "editor:other",
    });
    s = getBsSnapshot();
    expect(s.tabs).toHaveLength(1);
    expect(s.activeKey).toBe(s.tabs[0]?.key);
    betterSidebarService.openTab({
      type: "editor",
      title: "b.ts",
      path: "/ws/b.ts",
    });
    expect(getBsSnapshot().tabs).toHaveLength(2);
  });

  test("type-only open never expands the drawer; descriptor title wins", () => {
    track(
      betterSidebarService.registerTab({
        id: "my:panel",
        title: "My Panel",
        component: () => null,
      }),
    );
    setDrawerOpen(false);
    betterSidebarService.openTab({ type: "my:panel" });
    const s = getBsSnapshot();
    expect(s.tabs).toHaveLength(1);
    expect(s.drawerOpen).toBe(false);
    expect(s.tabs[0]?.title).toBe("My Panel");
    // a seed title OVERRIDES the descriptor title when given (DSH contract)
    betterSidebarService.openTab({
      type: "my:panel",
      id: "my:panel:2",
      title: "Override",
    });
    expect(getBsSnapshot().tabs.at(-1)?.title).toBe("Override");
  });

  test("id safety net dedupes default-id opens", () => {
    track(
      betterSidebarService.registerTab({
        id: "sing",
        title: "S",
        component: () => null,
      }),
    );
    betterSidebarService.openTab({ type: "sing" });
    betterSidebarService.openTab({ type: "sing" });
    expect(getBsSnapshot().tabs).toHaveLength(1);
  });

  test("lifecycle callbacks: open / activate (dedupe focus) / close", () => {
    const events: string[] = [];
    track(
      betterSidebarService.registerTab({
        id: "lc",
        title: "LC",
        onOpen: () => events.push("open"),
        onActivate: () => events.push("activate"),
        onClose: () => events.push("close"),
        component: () => null,
      }),
    );
    betterSidebarService.openTab({ type: "lc" });
    betterSidebarService.openTab({ type: "lc" }); // dedupe focus
    betterSidebarService.closeTab("lc");
    expect(events).toEqual(["open", "activate", "close"]);
  });

  test("matchFileViewer: priority desc, detect with head, exts, catch-all, disposer", () => {
    const disposeCsv = betterSidebarService.registerFileViewer({
      id: "csv",
      exts: ["csv"],
      priority: 10,
      fetchStrategy: "fsRead",
      component: () => null,
    });
    track(
      betterSidebarService.registerFileViewer({
        id: "catchall",
        exts: [],
        priority: -100,
        fetchStrategy: "none",
        component: () => null,
      }),
    );
    track(
      betterSidebarService.registerFileViewer({
        id: "det",
        exts: ["bin"],
        priority: 50,
        fetchStrategy: "none",
        detect: (_p, head) => head[0] === 0x25,
        component: () => null,
      }),
    );
    // detect hit beats priority order regardless of extension
    expect(
      betterSidebarService.matchFileViewer("/x/other", new Uint8Array([0x25]))
        ?.id,
    ).toBe("det");
    // without head bytes, detect cannot fire — exts miss, falls through
    expect(betterSidebarService.matchFileViewer("/x/other")?.id).toBe(
      "catchall",
    );
    expect(betterSidebarService.matchFileViewer("/x/y.CSV")?.id).toBe("csv");
    const csv = betterSidebarService
      .getFileViewers()
      .find((v) => v.id === "csv");
    expect(betterSidebarService.matchFileViewer("/x/y.csv")).toBe(csv);
    // the disposer unregisters — the catch-all takes over again
    disposeCsv();
    expect(betterSidebarService.matchFileViewer("/x/y.csv")?.id).toBe(
      "catchall",
    );
  });

  test("openFile defaults the title to the basename", () => {
    betterSidebarService.openFile({ sessionId: "t1" }, "/ws/deep/f.md");
    const s = getBsSnapshot();
    const last = s.tabs.at(-1);
    expect(last?.title).toBe("f.md");
    expect(last?.type).toBe("editor");
  });

  test("closeTab / activateTab / updateTab semantics", () => {
    betterSidebarService.openTab({ type: "editor", path: "/ws/1.md" });
    betterSidebarService.openTab({ type: "editor", path: "/ws/2.md" });
    const s0 = getBsSnapshot();
    const first = s0.tabs[0];
    expect(first).toBeDefined();
    betterSidebarService.activateTab("editor:/ws/1.md");
    expect(getBsSnapshot().activeKey).toBe(first?.key);
    betterSidebarService.updateTab("editor:/ws/1.md", { title: "renamed" });
    expect(
      getBsSnapshot().tabs.find((t) => t.id === "editor:/ws/1.md")?.title,
    ).toBe("renamed");
    betterSidebarService.closeTab("editor:/ws/1.md");
    const s1 = getBsSnapshot();
    expect(s1.tabs).toHaveLength(1);
    expect(s1.activeKey).toBe(s1.tabs[0]?.key);
    betterSidebarService.closeTab("unknown-id"); // strict no-op
    expect(getBsSnapshot().tabs).toHaveLength(1);
  });

  test("toThreadRelPath fences absolute plugin paths to the thread workspace", () => {
    expect(toThreadRelPath("/ws", "/ws/a/b.md")).toBe("a/b.md");
    expect(toThreadRelPath("/ws", "/ws")).toBe(".");
    expect(toThreadRelPath("/ws", "/other/a.md")).toBeNull();
    expect(toThreadRelPath(null, "/ws/a.md")).toBeNull();
  });

  test("toThreadRelPath passes git-relative rows through (DSH session-cwd semantics)", () => {
    expect(toThreadRelPath("/ws", "README.md")).toBe("README.md");
    expect(toThreadRelPath(null, "README.md")).toBe("README.md");
    expect(toThreadRelPath("/ws", "docs/plan.md")).toBe("docs/plan.md");
  });
});
