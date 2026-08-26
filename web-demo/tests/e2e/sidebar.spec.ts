import { expect, test } from "@playwright/test";

import { mockLangGraphAPI } from "./utils/mock-api";

test.describe("Sidebar navigation", () => {
  test("sidebar no longer has a flat Chats nav link", async ({ page }) => {
    mockLangGraphAPI(page);

    await page.goto("/workspace/chats/new");

    const sidebar = page.locator("[data-sidebar='sidebar']");
    // The flat "Chats" nav link has been retired — historical tasks now live
    // in the sidebar grouped by work mode, and new tasks start from a
    // dedicated "New task" button in the header.
    await expect(sidebar.locator("a[href='/workspace/chats']")).toHaveCount(0);
    // Agents menu was already removed earlier (see commit cc4a73d).
    await expect(
      sidebar.locator("a[href='/workspace/agents']"),
    ).toHaveCount(0);
  });

  test("new task button is present in sidebar header", async ({ page }) => {
    mockLangGraphAPI(page);

    await page.goto("/workspace/chats/new");

    const sidebar = page.locator("[data-sidebar='sidebar']");
    // The "New task" link lives in the SidebarHeader (WorkspaceHeader) and is
    // always rendered, even when the sidebar is collapsed.
    await expect(
      sidebar.locator("a[href='/workspace/chats/new']"),
    ).toBeVisible({ timeout: 15_000 });
  });
});
