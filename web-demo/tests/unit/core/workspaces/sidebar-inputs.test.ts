import { describe, expect, it } from "vitest";

import {
  buildSidebarInputs,
  owningWorkspace,
} from "@/core/workspaces/sidebar-inputs";
import type { WorkspaceTreeResponse } from "@/core/workspaces/types";

const tree: WorkspaceTreeResponse = {
  workspaces: [
    {
      id: "ws-1",
      path: "/projects/demo",
      title: "",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      position: 0,
      thread_ids: ["t1"],
    },
  ],
  ungrouped_thread_ids: ["t2"],
  archived_thread_ids: ["t3"],
};

describe("buildSidebarInputs", () => {
  it("把线程折叠成快照并按 ISO 时间换算 updatedAt", () => {
    const inputs = buildSidebarInputs(
      [
        { thread_id: "t1", title: "T1", updated_at: "2026-03-01T00:00:00Z" },
        { thread_id: "t2", title: "T2", updated_at: 1700000000000 },
        // 分页重复行按首次出现去重
        { thread_id: "t1", title: "dup", updated_at: "2020-01-01T00:00:00Z" },
      ],
      tree,
    );
    expect(inputs.list.ids).toEqual(["t1", "t2"]);
    expect(inputs.list.byId.t1).toMatchObject({ id: "t1", title: "T1" });
    expect(inputs.reachedBackend).toBe(true);
  });

  it("树投影行映射为 WorkspaceGroupInput（path→canonicalPath）", () => {
    const { groups } = buildSidebarInputs([], tree);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "ws-1",
      canonicalPath: "/projects/demo",
      threadIds: ["t1"],
    });
  });

  it("无效时间戳回退为 0 而不是 NaN", () => {
    const inputs = buildSidebarInputs(
      [{ thread_id: "x", title: "X", updated_at: "not-a-date" }],
      undefined,
    );
    expect(inputs.list.byId.x?.updatedAt).toBe(0);
  });

  it("tree 未到达时 reachedBackend=false 且 groups 为空", () => {
    const inputs = buildSidebarInputs([{ thread_id: "a", title: "", updated_at: 0 }], undefined);
    expect(inputs.groups).toEqual([]);
    expect(inputs.reachedBackend).toBe(false);
  });
});

describe("owningWorkspace", () => {
  it("归组成员返回所在组；Ungrouped 成员返回 undefined", () => {
    const inputs = buildSidebarInputs([], tree);
    expect(owningWorkspace(inputs, "t1")?.id).toBe("ws-1");
    expect(owningWorkspace(inputs, "t2")).toBeUndefined();
    // 后端未到达时一律不判定归属
    const pending = buildSidebarInputs([], undefined);
    expect(owningWorkspace(pending, "t1")).toBeUndefined();
  });
});
