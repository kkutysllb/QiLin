// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BACKEND_BASE_URL: "http://127.0.0.1:19987",
    NEXT_PUBLIC_LANGGRAPH_BASE_URL: "http://127.0.0.1:19987/api",
  },
}));

vi.mock("@/core/auth/session", () => ({
  getDesktopSessionToken: vi.fn(() => "desktop-token"),
}));

import { fetch as fetchWithAuth } from "@/core/api/fetcher";

function setDesktopMode(enabled: boolean) {
  const w = window as unknown as Record<string, unknown>;
  if (enabled) {
    w.kworksDesktop = { gatewayPort: 19987 };
  } else {
    delete w.kworksDesktop;
  }
}

function setDesktopModeWithFrontendPort(frontendPort: number) {
  const w = window as unknown as Record<string, unknown>;
  w.kworksDesktop = { gatewayPort: 19987, frontendPort };
}

function stubLocationPort(port: string) {
  Object.defineProperty(window, "location", {
    value: {
      ...window.location,
      port,
      origin: `http://localhost:${port}`,
    },
    writable: true,
  });
}

describe("fetcher desktop auth", () => {
  beforeEach(() => {
    setDesktopMode(false);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  });

  afterEach(() => {
    setDesktopMode(false);
    vi.restoreAllMocks();
  });

  test("adds bearer token in desktop production mode", async () => {
    setDesktopMode(true);
    stubLocationPort("");

    await fetchWithAuth("http://127.0.0.1:19987/api/v1/auth/me");

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    const headers = new Headers((init)?.headers);
    expect(headers.get("Authorization")).toBe("Bearer desktop-token");
  });

  test("injects bearer token in desktop dev mode alongside cookie auth", async () => {
    setDesktopModeWithFrontendPort(3000);
    stubLocationPort("3000");
    document.cookie = "csrf_token=csrf-dev-token";

    await fetchWithAuth("/api/models", { method: "POST" });

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    const request = init;
    const headers = new Headers(request?.headers);
    // Dev mode: REST calls go through the same-origin Next.js proxy (cookies
    // work), but the Bearer token is also injected so that any direct
    // gateway calls authenticate consistently.
    expect(headers.get("Authorization")).toBe("Bearer desktop-token");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-dev-token");
    expect(request?.credentials).toBe("include");
  });
});
