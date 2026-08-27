import { test, expect } from "@playwright/test";

// Placeholder e2e — requires the settings selector (Task 6.3) and a working
// auth flow before it can run for real. Committed as the wiring target now.
test("right sidebar opens files panel and renders markdown viewer", async ({ page }) => {
  await page.goto("/workspace"); // adjust to your auth flow
  // Open settings → right panel mode = sidebar (assumes the setting page added in Task 6).
  await page.getByRole("button", { name: /settings/i }).click();
  await page.getByLabel(/right panel mode/i).selectOption("sidebar");
  await page.keyboard.press("Escape");
  // Click the Files tab in the new right sidebar.
  await page.getByRole("button", { name: /files/i }).click();
  // Click README.md in the tree.
  await page.getByText("README.md").click();
  // Markdown heading renders.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
