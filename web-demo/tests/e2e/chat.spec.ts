import { expect, test } from "@playwright/test";

import {
  handleRunStream,
  MOCK_THREAD_ID,
  MOCK_THREAD_ID_2,
  mockLangGraphAPI,
} from "./utils/mock-api";

const BRANCH_THREADS = [
  {
    thread_id: MOCK_THREAD_ID,
    title: "Original conversation",
  },
];

const ORDERED_THREAD_ID = "00000000-0000-0000-0000-000000000003";
const ORDERED_THREADS = [
  {
    thread_id: ORDERED_THREAD_ID,
    title: "Ordered conversation",
    messages: [
      {
        type: "human",
        id: "ordered-human",
        content: [{ type: "text", text: "Please inspect the file." }],
      },
      {
        type: "ai",
        id: "ordered-ai",
        content: [
          { type: "text", text: "先说明文件的用途。" },
          {
            type: "tool_call",
            id: "ordered-tool-call",
            name: "read_file",
            args: { file_path: "README.md" },
          },
          { type: "thinking", thinking: "根据读取结果整理下一段说明。" },
          { type: "text", text: "现在继续说明读取结果。" },
        ],
      },
      {
        type: "tool",
        id: "ordered-tool-result",
        tool_call_id: "ordered-tool-call",
        content: '{"ok":true}',
      },
    ],
  },
];

test.describe("Chat workspace", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const fixture = testInfo.title.includes("branches")
      ? { threads: BRANCH_THREADS }
      : testInfo.title.includes("source order")
        ? { threads: ORDERED_THREADS }
        : undefined;
    mockLangGraphAPI(page, fixture);
  });

  test("new chat page loads with input box", async ({ page }) => {
    await page.goto("/workspace/chats/new");

    const textarea = page.getByPlaceholder(/how can i assist you/i);
    await expect(textarea).toBeVisible({ timeout: 15_000 });
  });

  test("can type a message in the input box", async ({ page }) => {
    await page.goto("/workspace/chats/new");

    const textarea = page.getByPlaceholder(/how can i assist you/i);
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    await textarea.fill("Hello, KWorks!");
    await expect(textarea).toHaveValue("Hello, KWorks!");
  });

  test("sending a message triggers API call and shows response", async ({
    page,
  }) => {
    let streamCalled = false;
    await page.route("**/runs/stream", (route) => {
      streamCalled = true;
      return handleRunStream(route);
    });

    await page.goto("/workspace/chats/new");

    const textarea = page.getByPlaceholder(/how can i assist you/i);
    await expect(textarea).toBeVisible({ timeout: 15_000 });

    await textarea.fill("Hello");
    await textarea.press("Enter");

    await expect.poll(() => streamCalled, { timeout: 10_000 }).toBeTruthy();

    // The AI response should appear in the chat
    await expect(page.getByText("Hello from KWorks!")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("preserves source order for prose, tools, and reasoning", async ({
    page,
  }) => {
    await page.goto("/workspace/chats/" + ORDERED_THREAD_ID + "?mock=true");

    const segments = page.locator("[data-segment-kind]");
    await expect(segments).toHaveCount(4, { timeout: 15_000 });
    await expect
      .poll(() =>
        segments.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-segment-kind")),
        ),
      )
      .toEqual(["prose", "tool_activity", "reasoning", "prose"]);
    await expect(page.getByText("先说明文件的用途。")).toBeVisible();
    await expect(page.getByText("读取文件")).toBeVisible();
    await expect(page.getByText("根据读取结果整理下一段说明。")).toBeVisible();
    await expect(page.getByText("现在继续说明读取结果。")).toBeVisible();
  });

  test("branches the current thread from the assistant footer", async ({
    page,
  }) => {
    await page.goto("/workspace/chats/" + MOCK_THREAD_ID + "?mock=true");

    await expect(
      page.getByText("Response in thread Original conversation"),
    ).toBeVisible({ timeout: 15_000 });

    const branchButton = page.getByTestId("assistant-action-branch");
    await expect(branchButton).toBeVisible();
    const copyRequest = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().includes("/copy"),
    );
    await branchButton.click();
    await copyRequest;

    await expect(page).toHaveURL("/workspace/chats/" + MOCK_THREAD_ID_2);
    await expect(
      page.getByText("Response in thread Branched conversation"),
    ).toBeVisible({ timeout: 15_000 });
  });
});
