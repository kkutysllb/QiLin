import { expect, test } from "@playwright/test";

import { mockLangGraphAPI } from "./utils/mock-api";

/**
 * 工作区分组侧栏（DSH 对齐 P3c）的真实浏览器渲染走查。
 * 注册表投影走本地 route mock，线程摘要复用既有 LangGraph 桩。
 */

const TREE = {
  workspaces: [
    {
      id: "ws-demo",
      path: "/projects/demo",
      title: "",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      position: 0,
      thread_ids: ["thread-a"],
    },
  ],
  ungrouped_thread_ids: ["thread-loose"],
  archived_thread_ids: ["thread-archived"],
};

test.describe("workspace-grouped sidebar", () => {
  test("renders workspace group + Ungrouped bucket and persists collapse", async ({
    page,
  }) => {
    mockLangGraphAPI(page, {
      threads: [
        {
          thread_id: "thread-a",
          title: "Thread A",
          updated_at: "2026-03-02T00:00:00Z",
        },
        {
          thread_id: "thread-loose",
          title: "Loose Thread",
          updated_at: "2026-03-01T00:00:00Z",
        },
        {
          thread_id: "thread-archived",
          title: "Archived Thread",
          updated_at: "2026-02-01T00:00:00Z",
        },
      ],
    });

    await page.route("**/api/workspaces/tree", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(TREE) }),
    );

    await page.goto("/workspace/chats/new");

    const sidebar = page.locator("[data-sidebar='sidebar']");
    // 组标签回退链：title 为空串 → 路径 basename
    await expect(sidebar.getByText("demo", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(sidebar.getByText("Ungrouped", { exact: false }).first()).toBeVisible();

    // 成员行按账户组分别可见
    await expect(sidebar.getByText("Thread A")).toBeVisible();
    await expect(sidebar.getByText("Loose Thread")).toBeVisible();
    // 归档成员不出现
    await expect(sidebar.getByText("Archived Thread")).toHaveCount(0);

    // 折叠工作组后其行消失、键持久化
    await sidebar.getByText("demo", { exact: true }).click();
    await expect(sidebar.getByText("Thread A")).toHaveCount(0);
    const persisted = await page.evaluate(() =>
      window.localStorage.getItem("kworks.workspace.collapsedGroups"),
    );
    expect(persisted).toContain("ws-demo");

    // 存档留证（桌面视口）
    await page.screenshot({
      path: "tests/screenshots/workspace-groups-sidebar.png",
      fullPage: false,
    });
  });
});
