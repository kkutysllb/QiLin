// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest";

import { getDesktopAuthHeaders } from "@/core/auth/session";

function setDesktopMode(enabled: boolean) {
  const w = window as unknown as Record<string, unknown>;
  if (enabled) {
    w.kworksDesktop = { gatewayPort: 19987 };
  } else {
    delete w.kworksDesktop;
  }
}

describe("desktop auth session helpers", () => {
  afterEach(() => {
    setDesktopMode(false);
  });

  test("adds the desktop auth marker only in Electron", () => {
    setDesktopMode(false);
    expect(getDesktopAuthHeaders()).toEqual({});

    setDesktopMode(true);
    expect(getDesktopAuthHeaders()).toEqual({ "X-KWorks-Desktop": "1" });
  });
});
