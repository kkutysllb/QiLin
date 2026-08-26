import { expect, test } from "@playwright/test";

import {
  mockLangGraphAPI,
  openSidebar,
  MOCK_THREAD_ID,
  MOCK_THREAD_ID_2,
} from "./utils/mock-api";

const THREADS = [
  {
    thread_id: MOCK_THREAD_ID,
    title: "First conversation",
    updated_at: "2025-06-01T12:00:00Z",
  },
  {
    thread_id: MOCK_THREAD_ID_2,
    title: "Second conversation",
    updated_at: "2025-06-02T12:00:00Z",
  },
];

test.describe("Thread history", () => {
  test("sidebar shows existing threads", async ({ page }) => {
    mockLangGraphAPI(page, { threads: THREADS });

    await page.goto("/workspace/chats/new");
    await openSidebar(page);

    // Both thread titles should appear in the sidebar
    await expect(page.getByText("First conversation")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Second conversation")).toBeVisible();
  });

  test("clicking a thread in sidebar navigates to it", async ({ page }) => {
    mockLangGraphAPI(page, { threads: THREADS });

    await page.goto("/workspace/chats/new");
    await openSidebar(page);

    // Wait for sidebar to populate
    const firstThread = page.getByText("First conversation");
    await expect(firstThread).toBeVisible({ timeout: 15_000 });

    // Click on the first thread
    await firstThread.click();

    // Should navigate to that thread's URL
    await page.waitForURL(`**/workspace/chats/${MOCK_THREAD_ID}`);
    await expect(page).toHaveURL(new RegExp(MOCK_THREAD_ID));
  });

  test("existing thread loads historical messages", async ({ page }) => {
    mockLangGraphAPI(page, { threads: THREADS });

    // Navigate directly to an existing thread
    await page.goto(`/workspace/chats/${MOCK_THREAD_ID}`);

    // The historical AI response should be displayed
    await expect(
      page.getByText("Response in thread First conversation"),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("chats list page redirects to new task page", async ({ page }) => {
    mockLangGraphAPI(page, { threads: THREADS });

    // The flat /workspace/chats list page was retired — it now redirects to
    // the new-task page so old bookmarks bounce to a working surface.
    // The redirect is client-side (useEffect + router.replace) because the
    // workspace layout gates children behind an auth check.
    await page.goto("/workspace/chats");

    await expect(page).toHaveURL(/\/workspace\/chats\/new$/, { timeout: 15_000 });
  });
});
