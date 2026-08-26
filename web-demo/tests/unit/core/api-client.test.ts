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

import { prepareLangGraphRequest } from "@/core/api/api-client";

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

describe("LangGraph API client request hook", () => {
  beforeEach(() => {
    setDesktopMode(false);
  });

  afterEach(() => {
    setDesktopMode(false);
    vi.restoreAllMocks();
  });

  test("adds bearer token in desktop production mode", () => {
    setDesktopMode(true);
    stubLocationPort("");

    const init = prepareLangGraphRequest(
      new URL("http://127.0.0.1:19987/api/threads/search"),
      { method: "POST" },
    );

    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer desktop-token");
  });

  test("injects bearer token in desktop dev mode (SDK direct connection bypasses proxy)", () => {
    setDesktopModeWithFrontendPort(18569);
    stubLocationPort("18569");
    document.cookie = "csrf_token=csrf-dev-token";

    const init = prepareLangGraphRequest(
      new URL("http://localhost:18569/api/threads/search"),
      { method: "POST" },
    );

    const headers = new Headers(init.headers);
    // Dev mode: SDK connects directly to localhost:<gatewayPort> (bypassing
    // the Next.js proxy for SSE streaming). SameSite cookies proved unreliable
    // across ports in Electron, so the Bearer token (from login's access_token
    // response field) is the primary auth signal. CSRF cookie is still injected
    // opportunistically (gateway exempts Bearer from CSRF double-submit).
    expect(headers.get("Authorization")).toBe("Bearer desktop-token");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-dev-token");
  });
});
