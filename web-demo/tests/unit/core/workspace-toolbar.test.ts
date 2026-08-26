import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const CHAT_PAGE = readFileSync(
  new URL("../../../src/app/workspace/chats/[thread_id]/page.tsx", import.meta.url),
  "utf8",
);
const AGENT_CHAT_PAGE = readFileSync(
  new URL(
    "../../../src/app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const DESKTOP_PROVIDERS = readFileSync(
  new URL("../../../src/components/desktop/providers.tsx", import.meta.url),
  "utf8",
);
const REMOVED_TOOLBAR_COMPONENTS = [
  "../../../src/components/desktop/backend-status.tsx",
  "../../../src/components/workspace/refresh-button.tsx",
  "../../../src/components/workspace/export-trigger.tsx",
] as const;

const chatPages = [
  ["workspace chat", CHAT_PAGE],
  ["agent chat", AGENT_CHAT_PAGE],
] as const;

describe("workspace chat toolbar", () => {
  test.each(chatPages)("%s removes desktop status, refresh, and export actions", (_name, source) => {
    expect(source).not.toMatch(/\bBackendStatusIndicator\b/);
    expect(source).not.toMatch(/\bRefreshButton\b/);
    expect(source).not.toMatch(/\bExportTrigger\b/);
  });

  test.each(chatPages)("%s keeps unboxed utility actions", (_name, source) => {
    // ArtifactTrigger survives on both pages.
    expect(source).toMatch(/\bArtifactTrigger\b/);
    // TodoTrigger was removed with the old todo sidebar refactor —
    // todos now live in the right-context-panel (todos-section.tsx).
    expect(source).not.toMatch(/\bTodoTrigger\b/);
  });

  test("workspace chat keeps the task token summary", () => {
    expect(CHAT_PAGE).toMatch(/\bTaskTokenSummary\b/);
  });

  test("desktop providers do not add a custom title bar below the system title bar", () => {
    expect(DESKTOP_PROVIDERS).not.toMatch(/\bDesktopTitleBar\b/);
  });

  test("desktop providers keep the renderer default theme light", () => {
    expect(DESKTOP_PROVIDERS).toMatch(/defaultTheme="light"/);
  });

  test("unused top-right toolbar components are removed", () => {
    for (const componentPath of REMOVED_TOOLBAR_COMPONENTS) {
      expect(existsSync(new URL(componentPath, import.meta.url))).toBe(false);
    }
  });
});
