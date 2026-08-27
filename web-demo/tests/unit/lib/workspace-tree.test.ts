import { describe, expect, it } from "vitest";

import {
  byRecency,
  deriveFlat,
  deriveGroups,
  relativeTime,
  UNGROUPED_KEY,
  UNGROUPED_LABEL,
  workspaceLabel,
} from "@/lib/workspace-tree";
import type { ThreadListSnapshot, ThreadSummary, WorkspaceGroupInput } from "@/lib/workspace-tree";

const summary = (id: string, updatedAt: number): ThreadSummary => ({
  id,
  title: id,
  updatedAt,
});
const list = (...items: ThreadSummary[]): ThreadListSnapshot => ({
  ids: items.map((item) => item.id),
  byId: Object.fromEntries(items.map((item) => [item.id, item])),
});
const workspace = (
  id: string,
  threadIds: string[],
  title = id,
): WorkspaceGroupInput => ({
  id,
  canonicalPath: `/projects/${id}`,
  title,
  createdAt: "2026-01-01T00:00:00.000Z",
  threadIds,
});
const view = (
  expandedGroups: readonly string[] = [],
  ungroupedOrder?: readonly string[],
) => ({
  expandedGroups,
  ...(ungroupedOrder === undefined ? {} : { ungroupedOrder }),
});
const noArchive: readonly string[] = [];

describe("deriveGroups", () => {
  it("保持注册表账户序，不按客户端最近更新重排", () => {
    const sessions = list(summary("newer", 20), summary("older", 10));
    const groups = deriveGroups(
      sessions,
      [workspace("first", ["older", "newer"]), workspace("empty", [])],
      noArchive,
      view(["first"]),
    );
    expect(groups.map((g) => g.key)).toEqual(["first", "empty"]);
    expect(groups[0]!.sessions.map((s) => s.id)).toEqual(["older", "newer"]);
  });

  it("仅把未入组的真实会话放进尾随的 Ungrouped 桶", () => {
    const sessions = list(summary("owned", 1), summary("loose", 9));
    const groups = deriveGroups(
      sessions,
      [workspace("first", ["owned"])],
      noArchive,
      view([UNGROUPED_KEY]),
    );
    expect(groups.map((g) => g.key)).toEqual(["first", UNGROUPED_KEY]);
    expect(groups[1]!.sessions.map((s) => s.id)).toEqual(["loose"]);
  });

  it("应用已存 Ungrouped 本地序并按最近更新追加新 loose 行（容忍陈旧与重复表项）", () => {
    const sessions = list(summary("one", 3), summary("two", 2), summary("new", 4));
    const groups = deriveGroups(
      sessions,
      [],
      noArchive,
      view([UNGROUPED_KEY], ["two", "stale", "two"]),
    );
    expect(groups[0]!.sessions.map((s) => s.id)).toEqual(["two", "new", "one"]);
  });

  it("未初始化 Ungrouped 本地序时回退到最近更新 + id 平局裁决", () => {
    const sessions = list(
      summary("parent", 10),
      summary("tie-b", 20),
      summary("tie-a", 20),
    );
    const groups = deriveGroups(sessions, [], noArchive, view([UNGROUPED_KEY]));
    expect(groups[0]!.sessions.map((s) => s.id)).toEqual([
      "tie-a",
      "tie-b",
      "parent",
    ]);
  });

  it("容忍账户先于摘要到达：缺失行不渲染也不落 Ungrouped", () => {
    const partial: ThreadListSnapshot = {
      ids: ["present"],
      byId: { present: summary("present", 1) },
    };
    const groups = deriveGroups(
      partial,
      [workspace("project", ["missing", "present"])],
      noArchive,
      view(["project"]),
    );
    expect(groups[0]!.sessions.map((s) => s.id)).toEqual(["present"]);
  });

  it("归档会话从工作组与 Ungrouped 双双隐藏；空桶不再出现，空组保留", () => {
    const kept = summary("kept", 1);
    const gone = summary("gone", 2);
    const looseGone = summary("loose-gone", 3);
    const sessions = list(kept, gone, looseGone);
    const groups = deriveGroups(
      sessions,
      [workspace("first", ["kept", "gone"])],
      ["gone", "loose-gone"],
      view(["first", UNGROUPED_KEY]),
    );
    expect(groups.map((g) => g.key)).toEqual(["first"]);
    expect(groups[0]!.sessions.map((s) => s.id)).toEqual(["kept"]);
    expect(groups[0]!.sessionCount).toBe(1);
  });

  it("折叠只影响行投影不影响计数；containsCurrent 标记当前会话所在组", () => {
    const owned = summary("owned", 1);
    const loose = summary("loose", 2);
    const ws = workspace("project", ["owned"]);
    const folded = deriveGroups(list(owned, loose), [ws], noArchive, view([]), "owned");
    expect(folded.find((g) => g.key === "project")).toMatchObject({
      expanded: false,
      sessionCount: 1,
      containsCurrent: true,
      sessions: [],
    });
    const looseGroups = deriveGroups(
      list(owned, loose),
      [ws],
      noArchive,
      view([UNGROUPED_KEY]),
      "loose",
    );
    expect(looseGroups.find((g) => g.key === UNGROUPED_KEY)!.containsCurrent).toBe(true);
  });

  it("无标题工作区回退到路径 basename 作为展示标签", () => {
    const groups = deriveGroups(
      list(),
      [{ ...workspace("ws-1", []), title: "" }],
      noArchive,
      view(),
    );
    expect(groups[0]!.label).toBe("ws-1");
  });
});

describe("deriveFlat", () => {
  it("拍平全部会话：严格最新在前，时间相等以 id 平局裁决", () => {
    const rows = deriveFlat(
      list(summary("parent", 10), summary("child", 30), summary("tie-b", 20), summary("tie-a", 20)),
      noArchive,
    );
    expect(rows.map((r) => r.id)).toEqual(["child", "tie-a", "tie-b", "parent"]);
  });

  it("扁平视图剔除归档行与未知 id", () => {
    const kept = summary("kept", 1);
    const snapshot: ThreadListSnapshot = {
      ...list(kept, summary("gone", 2)),
      ids: ["ghost", ...list(kept).ids],
    };
    expect(deriveFlat(snapshot, ["gone"]).map((r) => r.id)).toEqual(["kept"]);
  });
});

describe("byRecency", () => {
  it("相等 updatedAt 以 id 字典序收敛（任一输入顺序同结果）", () => {
    const a = summary("a", 1);
    const b = summary("b", 1);
    expect([...[b, a]].sort(byRecency)).toEqual([a, b]);
    expect([...[a, b]].sort(byRecency)).toEqual([a, b]);
  });
});

describe("workspaceLabel", () => {
  it("Ungrouped 兜底 + POSIX/Windows basename 提取", () => {
    expect(workspaceLabel(undefined)).toBe(UNGROUPED_LABEL);
    expect(workspaceLabel("")).toBe(UNGROUPED_LABEL);
    expect(workspaceLabel("/projects/demo/")).toBe("demo");
    expect(workspaceLabel("C:\\projects\\demo\\")).toBe("demo");
    expect(workspaceLabel("/")).toBe("/");
  });
});

describe("relativeTime", () => {
  it("分桶 now/分钟/小时/天/月/年", () => {
    const now = 400 * 24 * 60 * 60 * 1_000;
    expect(relativeTime(now, now)).toEqual({ unit: "now", n: 0 });
    expect(relativeTime(now - 5 * 60_000, now)).toEqual({ unit: "minutes", n: 5 });
    expect(relativeTime(now - 3 * 3_600_000, now)).toEqual({ unit: "hours", n: 3 });
    expect(relativeTime(now - 2 * 86_400_000, now)).toEqual({ unit: "days", n: 2 });
    expect(relativeTime(now - 60 * 86_400_000, now)).toEqual({ unit: "months", n: 2 });
    expect(relativeTime(0, now)).toEqual({ unit: "years", n: 1 });
  });
});
