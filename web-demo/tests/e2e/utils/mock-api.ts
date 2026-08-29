/**
 * Shared mock helpers for E2E tests.
 *
 * Intercepts all LangGraph / Backend API endpoints so tests can run without
 * a real backend.  Each test file imports `mockLangGraphAPI` and
 * `handleRunStream` from here.
 */

import type { Page, Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Constants — deterministic IDs used across tests
// ---------------------------------------------------------------------------

export const MOCK_THREAD_ID = "00000000-0000-0000-0000-000000000001";
export const MOCK_THREAD_ID_2 = "00000000-0000-0000-0000-000000000002";
export const MOCK_RUN_ID = "00000000-0000-0000-0000-000000000099";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MockThread = {
  thread_id: string;
  title?: string;
  updated_at?: string;
  agent_name?: string;
  messages?: Array<Record<string, unknown>>;
};

export type MockAgent = {
  name: string;
  description?: string;
  system_prompt?: string;
};

export type MockModel = {
  id: string;
  name: string;
  use: string;
  model: string;
  display_name: string;
  supports_thinking?: boolean;
  supports_vision?: boolean;
};

export type MockAPIOptions = {
  threads?: MockThread[];
  agents?: MockAgent[];
  models?: MockModel[];
};

// ---------------------------------------------------------------------------
// mockLangGraphAPI
// ---------------------------------------------------------------------------

/**
 * Mock all LangGraph API endpoints that the frontend calls on page load and
 * during message sending.  Without these mocks the pages would hang waiting
 * for a real backend.
 */
export function mockLangGraphAPI(page: Page, options?: MockAPIOptions) {
  const threads = options?.threads ?? [];
  const agents = options?.agents ?? [];
  const models = options?.models ?? [];
  const defaultMessagesForThread = (thread: MockThread) => [
    {
      type: "human",
      id: "msg-human-" + thread.thread_id,
      content: [{ type: "text", text: "Previous question" }],
    },
    {
      type: "ai",
      id: "msg-ai-" + thread.thread_id,
      content: "Response in thread " + (thread.title ?? thread.thread_id),
    },
  ];
  const messagesForThread = (thread: MockThread) =>
    thread.messages ?? defaultMessagesForThread(thread);

  // Auth — workspace layout client-side guard checks /api/v1/auth/me on
  // every page load.  Without this mock the layout falls through to
  // "gateway_unavailable" and the workspace content never renders.
  void page.route("**/api/v1/auth/me**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "e2e-user",
          email: "e2e@test.local",
          system_role: "admin",
          needs_setup: false,
        }),
      });
    }
    return route.fallback();
  });

  // Auth setup-status — checked as a fallback when /auth/me returns 401
  void page.route("**/api/v1/auth/setup-status**", (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ needs_setup: false }),
    });
  });

  // Workspace and skill bootstrap data used by the sidebar.
  void page.route("**/api/workspaces/tree", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        workspaces: [],
        ungrouped_thread_ids: [],
        archived_thread_ids: [],
      }),
    });
  });
  void page.route("**/api/skills", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ skills: [] }),
    });
  });

  // Thread search — sidebar thread list & chats list page
  void page.route("**/api/langgraph/threads/search", (route) => {
    const body = threads.map((t) => ({
      thread_id: t.thread_id,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: t.updated_at ?? "2025-01-01T00:00:00Z",
      metadata: t.agent_name ? { agent_name: t.agent_name } : {},
      status: "idle",
      values: { title: t.title ?? "Untitled" },
    }));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  // Thread create — called when user sends first message in a new chat
  void page.route("**/api/langgraph/threads", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          thread_id: MOCK_THREAD_ID,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {},
          status: "idle",
          values: {},
        }),
      });
    }
    return route.fallback();
  });

  // Thread update (PATCH) — metadata update after creation
  void page.route("**/api/langgraph/threads/*", (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ thread_id: MOCK_THREAD_ID }),
      });
    }
    return route.fallback();
  });

  // Thread copy — assistant footer branch action
  void page.route(
    /\/(?:api\/langgraph|mock\/api)\/threads\/[^/]+\/copy(?:\?.*)?$/,
    (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const copiedThread: MockThread = {
        thread_id: MOCK_THREAD_ID_2,
        title: "Branched conversation",
      };
      if (
        !threads.some((thread) => thread.thread_id === copiedThread.thread_id)
      ) {
        threads.push(copiedThread);
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          thread_id: copiedThread.thread_id,
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
          metadata: {},
          status: "idle",
        }),
      });
    },
  );

  // Thread history — useStream fetches state history on mount
  void page.route("**/api/langgraph/threads/*/history", (route) => {
    const url = route.request().url();

    // For threads that exist in our mock data, return history with messages
    const matchingThread = threads.find((t) => url.includes(t.thread_id));
    if (matchingThread) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            values: {
              title: matchingThread.title ?? "Untitled",
              messages: messagesForThread(matchingThread),
            },
            next: [],
            metadata: {},
            created_at: "2025-01-01T00:00:00Z",
            parent_config: null,
          },
        ]),
      });
    }

    // New threads — empty history
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  // Thread state — getState for individual thread
  void page.route("**/api/langgraph/threads/*/state", (route) => {
    if (route.request().method() === "GET") {
      const url = route.request().url();
      const matchingThread = threads.find((t) => url.includes(t.thread_id));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          values: {
            title: matchingThread?.title ?? "Untitled",
            messages: matchingThread ? messagesForThread(matchingThread) : [],
          },
          next: [],
          metadata: {},
          created_at: "2025-01-01T00:00:00Z",
        }),
      });
    }
    return route.fallback();
  });

  // The URL carries a query string (e.g. `?limit=10&offset=0`), which Playwright
  // glob `*` does NOT cross, so we match with a regex anchored to `/runs`
  // followed by `?` or end-of-string.  This must NOT match `/runs/stream`.
  void page.route(/\/api\/langgraph\/threads\/([^/]+)\/runs(\?|$)/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const matchingThread = threads.find((thread) =>
      route.request().url().includes(thread.thread_id),
    );
    const run = matchingThread
      ? {
          run_id: "mock-run-" + matchingThread.thread_id,
          thread_id: matchingThread.thread_id,
          status: "success",
          assistant_id: "lead_agent",
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        }
      : null;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(run ? [run] : []),
    });
  });

  // Historical messages are loaded from the selected run after the run list.
  void page.route(
    /\/api\/threads\/([^/]+)\/runs\/([^/]+)\/messages(?:\?.*)?$/,
    (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      const matchingThread = threads.find((thread) =>
        route.request().url().includes(thread.thread_id),
      );
      if (!matchingThread) return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: messagesForThread(matchingThread).map((message) => ({
            run_id: "mock-run-" + matchingThread.thread_id,
            content: message,
            metadata: { caller: "e2e" },
            created_at: "2025-01-01T00:00:00Z",
          })),
          hasMore: false,
        }),
      });
    },
  );

  // Mock-mode useStream restores the latest thread state through this endpoint.
  void page.route(/\/mock\/api\/threads\/[^/]+\/history(?:\?.*)?$/, (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const matchingThread = threads.find((thread) =>
      route.request().url().includes(thread.thread_id),
    );
    if (!matchingThread) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          values: {
            title: matchingThread.title ?? "Untitled",
            messages: messagesForThread(matchingThread),
          },
          next: [],
          metadata: {},
          created_at: "2025-01-01T00:00:00Z",
          parent_config: null,
        },
      ]),
    });
  });

  // Run stream — returns a minimal SSE response with an AI message
  void page.route("**/api/langgraph/runs/stream", handleRunStream);
  void page.route("**/api/langgraph/threads/*/runs/stream", handleRunStream);

  // Models list — model picker dropdown
  void page.route("**/api/models", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          models,
          token_usage: { enabled: false },
        }),
      });
    }
    return route.fallback();
  });

  // Follow-up suggestions — input box auto-suggest after AI response
  void page.route("**/api/threads/*/suggestions", (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ suggestions: [] }),
      });
    }
    return route.fallback();
  });

  // Agents list — sidebar & gallery page
  void page.route("**/api/agents", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ agents }),
      });
    }
    return route.fallback();
  });

  // Individual agent — agent chat page
  void page.route("**/api/agents/*", (route) => {
    if (route.request().method() === "GET") {
      const url = route.request().url();
      const agent = agents.find((a) => url.endsWith(`/api/agents/${a.name}`));
      if (agent) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(agent),
        });
      }
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Agent not found" }),
    });
  });

  // Some desktop-style configurations use a direct backend origin for auth.
  void page.route(/\/api\/v1\/auth\/me(?:\?.*)?$/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "e2e-user",
        email: "e2e@test.local",
        system_role: "admin",
        needs_setup: false,
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// handleRunStream
// ---------------------------------------------------------------------------

/**
 * Build a minimal SSE stream that the LangGraph SDK can parse.
 * The stream returns a single AI message: "Hello from KWorks!".
 */
export function handleRunStream(route: Route) {
  const events = [
    {
      event: "metadata",
      data: { run_id: MOCK_RUN_ID, thread_id: MOCK_THREAD_ID },
    },
    {
      event: "values",
      data: {
        messages: [
          {
            type: "human",
            id: "msg-human-1",
            content: [{ type: "text", text: "Hello" }],
          },
          {
            type: "ai",
            id: "msg-ai-1",
            content: "Hello from KWorks!",
          },
        ],
      },
    },
    { event: "end", data: {} },
  ];

  const body = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join("");

  return route.fulfill({
    status: 200,
    contentType: "text/event-stream",
    body,
  });
}

// ---------------------------------------------------------------------------
// openSidebar
// ---------------------------------------------------------------------------

/**
 * Expand the workspace sidebar so RecentChatList (thread groups) becomes
 * visible.  The sidebar starts collapsed (``defaultOpen={false}``) so tests
 * that need to interact with thread items must call this after navigating.
 *
 * Uses the keyboard shortcut Cmd/Ctrl+B because the sidebar trigger button
 * is hidden when collapsed (only appears on hover) and cannot be clicked
 * directly.
 */
export async function openSidebar(page: Page): Promise<void> {
  const sidebar = page.locator('[data-slot="sidebar"][data-state="collapsed"]');
  if ((await sidebar.count()) === 0) return;
  await page.getByTestId("workspace-sidebar-trigger").click();
  await page
    .locator('[data-slot="sidebar"][data-state="expanded"]')
    .waitFor({ state: "attached", timeout: 5_000 });
}
