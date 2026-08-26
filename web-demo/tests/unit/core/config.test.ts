// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest";

// Mock @/env before importing config
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BACKEND_BASE_URL: "",
    NEXT_PUBLIC_LANGGRAPH_BASE_URL: "",
  },
}));

import {
  getBackendBaseURL,
  getLangGraphBaseURL,
  isDesktop,
  isDesktopBackendManagedMode,
  isDesktopDevMode,
} from "@/core/config";

/** Helper: install/remove the Electron preload bridge on `window`. */
function setDesktopBridge(present: boolean) {
  const w = window as unknown as Record<string, unknown>;
  if (present) {
    w.kworksDesktop = { gatewayPort: 19987 };
  } else {
    delete w.kworksDesktop;
  }
}

/** Helper: stub `window.location.port` for the duration of a test. */
function stubLocationPort(port: string, origin?: string) {
  Object.defineProperty(window, "location", {
    value: {
      ...window.location,
      port,
      origin: origin ?? `http://localhost:${port}`,
    },
    writable: true,
  });
}

describe("isDesktop", () => {
  afterEach(() => {
    setDesktopBridge(false);
  });

  test("returns false in a regular browser", () => {
    setDesktopBridge(false);
    expect(isDesktop()).toBe(false);
  });

  test("returns true when window.kworksDesktop is present", () => {
    setDesktopBridge(true);
    expect(isDesktop()).toBe(true);
  });
});

describe("desktop runtime mode", () => {
  afterEach(() => {
    setDesktopBridge(false);
  });

  test("detects Electron dev mode only on the desktop dev server port", () => {
    setDesktopBridge(true);
    stubLocationPort("18569");
    expect(isDesktopDevMode()).toBe(true);
    expect(isDesktopBackendManagedMode()).toBe(false);
  });

  test("treats packaged desktop as Electron-managed backend mode", () => {
    setDesktopBridge(true);
    stubLocationPort("");
    expect(isDesktopDevMode()).toBe(false);
    expect(isDesktopBackendManagedMode()).toBe(true);
  });

  test("does not mark regular web mode as desktop dev or desktop-managed", () => {
    setDesktopBridge(false);
    stubLocationPort("18569");
    expect(isDesktopDevMode()).toBe(false);
    expect(isDesktopBackendManagedMode()).toBe(false);
  });
});

describe("getBackendBaseURL", () => {
  afterEach(() => {
    setDesktopBridge(false);
  });

  test("returns empty string in web mode without env var", () => {
    setDesktopBridge(false);
    expect(getBackendBaseURL()).toBe("");
  });

  test("returns direct gateway URL in desktop dev mode (port 18569)", () => {
    // Desktop dev connects DIRECTLY to the gateway at localhost:<port> —
    // not via the Next.js rewrite proxy — so cookie auth + CSRF work
    // same-site (see getBackendBaseURL).
    setDesktopBridge(true);
    stubLocationPort("18569");
    const url = getBackendBaseURL();
    expect(url).toContain("localhost");
    expect(url).toContain("19987");
  });

  test("returns direct gateway URL in desktop production mode (non-18569 port)", () => {
    setDesktopBridge(true);
    stubLocationPort("");
    const url = getBackendBaseURL();
    expect(url).toContain("127.0.0.1");
    expect(url).toContain("19987");
  });

  test("returns correct default gateway port in production mode", () => {
    setDesktopBridge(true);
    stubLocationPort("");
    const url = getBackendBaseURL();
    expect(url).toBe("http://127.0.0.1:19987");
  });
});

describe("getLangGraphBaseURL", () => {
  afterEach(() => {
    setDesktopBridge(false);
  });

  test("returns origin-based URL in web mode", () => {
    setDesktopBridge(false);
    const url = getLangGraphBaseURL();
    expect(url).toContain("/api/langgraph");
  });

  test("returns direct localhost gateway URL in desktop dev mode (SSE streaming bypasses Next.js proxy)", () => {
    // Dev mode LangGraph SDK (streaming) connects DIRECTLY to the gateway at
    // `localhost:<port>` to bypass the Next.js rewrite proxy (which buffers
    // SSE responses). Same-site `localhost` is used so any cookies that DO
    // survive the cross-port fetch are carried; Bearer auth (from login's
    // access_token response field) is the primary auth signal for this path.
    setDesktopBridge(true);
    stubLocationPort("18569", "http://localhost:18569");
    const url = getLangGraphBaseURL();
    expect(url).toContain("localhost");
    expect(url).toContain("/api");
    expect(url).not.toContain("127.0.0.1");
    expect(url).not.toContain("/api/langgraph");
  });

  test("returns direct gateway URL in desktop production mode", () => {
    setDesktopBridge(true);
    stubLocationPort("");
    const url = getLangGraphBaseURL();
    expect(url).toContain("127.0.0.1");
    expect(url).toContain("/api");
  });
});
