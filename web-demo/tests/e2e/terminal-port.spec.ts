/**
 * Terminal port E2E — the full chain through the browser:
 *
 *   page → REST create → gateway TerminalRegistry → real PTY shell
 *   xterm keystrokes → WS binary frames → pty stdin → shell runs
 *   pty stdout → WS frames → xterm render (+ scrollback via REST read)
 *
 * Requirements: a QiLin gateway listening on 127.0.0.1:28081 with auth
 * disabled (QILIN_AUTH_DISABLED=1) and KMP_INIT_AT_FORK=FALSE when
 * uvloop + OpenMP/torch share the process. When the gateway is absent the
 * whole suite skips instead of failing.
 */

import { expect, test, type Page } from "@playwright/test";

const GATEWAY = "http://127.0.0.1:28081";

let gatewayUp = false;

test.beforeAll(async ({ request }) => {
  try {
    const res = await request.get(`${GATEWAY}/health`, { timeout: 4000 });
    gatewayUp = res.ok();
  } catch {
    gatewayUp = false;
  }
  test.skip(!gatewayUp, "gateway not running on 127.0.0.1:28081");
});

/** Read the newest terminal's retained transcript through the REST API. */
async function readLatestTranscript(
  page: Page,
  threadId: string,
): Promise<string> {
  return page.evaluate(async (tid) => {
    const list = await fetch(`/api/threads/${tid}/terminals`, {
      credentials: "include",
    }).then((r) => r.json());
    const newest = list[list.length - 1];
    if (!newest) return "";
    const body = await fetch(
      `/api/threads/${tid}/terminals/${newest.uuid}/read?offset=-60&count=60`,
      { credentials: "include" },
    ).then((r) => r.json());
    return typeof body.text === "string" ? body.text : "";
  }, threadId);
}

async function pollTranscript(
  page: Page,
  threadId: string,
  needle: string,
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (Date.now() < deadline) {
    text = await readLatestTranscript(page, threadId);
    if (text.includes(needle)) return text;
    await page.waitForTimeout(500);
  }
  return text;
}

test.describe("terminal port surface", () => {
  test("creates a terminal, echoes a typed command, and reads it back", async ({
    page,
  }) => {
    const threadId = `e2e-echo-${Date.now()}`;
    const marker = `qilin-e2e-${Math.random().toString(36).slice(2, 8)}`;

    await page.goto(`/workspace/terminal?thread=${threadId}`);
    await expect(page.locator(".xterm")).toBeVisible({ timeout: 15_000 });

    // Status transitions starting -> ready when the WS stream attaches.
    // The buttons carry aria-labels, so match those (accessible name wins
    // over visible text in the role selector).
    const sigintButton = page.getByRole("button", { name: /send SIGINT/i });
    await expect(sigintButton).toBeVisible({ timeout: 15_000 });

    await page.locator(".xterm").click();
    await page.keyboard.type(`echo ${marker}`);
    await page.keyboard.press("Enter");

    const transcript = await pollTranscript(page, threadId, marker);
    expect(transcript).toContain(`echo ${marker}`); // typed echo
    expect(transcript).toContain(marker); // executed output
  });

  test("SIGINT control frame reaches the shell without breaking the stream", async ({
    page,
  }) => {
    const threadId = `e2e-sigint-${Date.now()}`;

    await page.goto(`/workspace/terminal?thread=${threadId}`);
    await expect(page.locator(".xterm")).toBeVisible({ timeout: 15_000 });
    const sigint = page.getByRole("button", { name: /send SIGINT/i });
    await expect(sigint).toBeVisible({ timeout: 15_000 });

    // Warm the shell first: keystrokes typed before zsh finishes booting
    // land in the tty line buffer and corrupt the later flow (flaky paste
    // mode). Poll until a warm-up echo actually executes.
    await page.locator(".xterm").click();
    const warm = `warm-${Date.now() % 100000}`;
    await page.keyboard.type(`echo ${warm}`);
    await page.keyboard.press("Enter");
    await pollTranscript(page, threadId, warm);

    // Start a sleeper, then interrupt it from the UI control plane.
    await page.locator(".xterm").click();
    await page.keyboard.type("sleep 30");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    await sigint.click();

    // The shell survives the interrupt: a prompt comes back and a follow-up
    // echo executes.
    const marker = `alive-${Date.now() % 100000}`;
    await page.waitForTimeout(600);
    await page.locator(".xterm").click();
    await page.keyboard.type(`echo ${marker}`);
    await page.keyboard.press("Enter");

    const transcript = await pollTranscript(page, threadId, marker);
    expect(transcript).toContain(marker);
  });

  test("the new-terminal control spawns a second terminal", async ({ page }) => {
    const threadId = `e2e-restart-${Date.now()}`;

    await page.goto(`/workspace/terminal?thread=${threadId}`);
    await expect(page.locator(".xterm")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /send SIGINT/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: /restart terminal/i }).click();

    // The remounted panel goes through starting -> ready again.
    await expect(page.getByRole("button", { name: /send SIGINT/i })).toBeVisible({
      timeout: 15_000,
    });

    // Two live terminals now exist for this thread.
    const count = await page.evaluate(async (tid) => {
      const list = await fetch(`/api/threads/${tid}/terminals`, {
        credentials: "include",
      }).then((r) => r.json());
      return list.length;
    }, threadId);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("surface.open events land in the viewer (file + url)", async ({
    page,
    request,
  }) => {
    const threadId = `e2e-surface-${Date.now()}`;
    const marker = `surface-${Math.random().toString(36).slice(2, 8)}`;

    // Seed a workspace file through the files API, then open surfaces via
    // the surface REST route (same shared policy as the sidebar_open tool).
    // A fresh synthetic thread has no workspace yet: mkdir bootstraps it
    // (files/write intentionally refuses to create parent directories).
    const mkdir = await request.post(`${GATEWAY}/api/files/mkdir`, {
      data: { thread_id: threadId, path: "." },
    });
    expect(mkdir.ok()).toBeTruthy();
    const write = await request.post(`${GATEWAY}/api/files/write`, {
      data: {
        thread_id: threadId,
        path: "surface-demo.md",
        content: `# ${marker}\nbody line\n`,
      },
    });
    expect(write.ok()).toBeTruthy();
    const fileOpen = await request.post(
      `${GATEWAY}/api/threads/${threadId}/surfaces`,
      { data: { target: "surface-demo.md" } },
    );
    expect(fileOpen.ok()).toBeTruthy();
    const urlOpen = await request.post(
      `${GATEWAY}/api/threads/${threadId}/surfaces`,
      {
        data: {
          target: `${GATEWAY}/api/files/raw?thread_id=${threadId}&path=surface-demo.md`,
        },
      },
    );
    expect(urlOpen.ok()).toBeTruthy();

    // Both opens happened while detached: loading the page attaches the
    // WS, which drains the queue into the viewer.
    await page.goto(`/workspace/terminal?thread=${threadId}`);
    await expect(page.getByTestId("surface-tab")).toHaveCount(2, {
      timeout: 15_000,
    });
    // Newest (the url open) takes focus.
    await expect(page.getByTestId("surface-frame")).toBeVisible({
      timeout: 15_000,
    });

    // Switch to the file tab: content renders through the files API.
    await page.getByRole("button", { name: /surface-demo\.md/ }).first().click();
    await expect(page.getByTestId("surface-content")).toContainText(marker, {
      timeout: 10_000,
    });
  });
});
