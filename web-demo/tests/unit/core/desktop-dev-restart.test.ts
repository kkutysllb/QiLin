import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = resolve(__dirname, "../../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("desktop dev restart flow", () => {
  test("config settings use Electron IPC only when the desktop backend is Electron-managed", () => {
    // Restart logic was extracted into the shared useApplyAndRestart hook
    // (see use-apply-and-restart.ts). The hook and the settings pages that
    // consume it must keep using isDesktopBackendManagedMode, not isDesktop().
    // (The old config-settings-page.tsx was removed in the settings refactor;
    // memory-summary-settings-page.tsx is a representative consumer.)
    const hookSource = read(
      "src/components/workspace/settings/use-apply-and-restart.ts",
    );
    const pageSource = read(
      "src/components/workspace/settings/memory-summary-settings-page.tsx",
    );

    expect(hookSource).toContain("isDesktopBackendManagedMode");
    expect(pageSource).toContain("useApplyAndRestart");
    for (const source of [hookSource, pageSource]) {
      expect(source).not.toContain("const desktop = isDesktop()");
      expect(source).not.toContain("if (desktop) {");
    }
  });

  test("desktop initializer does not start an Electron-owned backend in desktop dev", () => {
    const source = read("src/components/desktop/desktop-init.tsx");

    expect(source).toContain("isDesktopBackendManagedMode");
    expect(source).toContain("if (isDesktopBackendManagedMode())");
  });

  test("desktop backend status UI is not exported from the renderer bundle", () => {
    const source = read("src/components/desktop/index.ts");

    expect(source).not.toContain("BackendStatusIndicator");
    expect(source).not.toContain("backend-status");
  });

  test("Next dev proxies gateway health checks and allows Electron localhost origins", () => {
    const source = read("next.config.js");

    expect(source).toContain("allowedDevOrigins");
    expect(source).toContain("127.0.0.1");
    expect(source).toContain('source: "/health"');
    expect(source).toContain('destination: `${gatewayURL}/health`');
  });

  test("desktop backend splash does not poll unmanaged desktop dev backend status", () => {
    const source = read("src/components/desktop/backend-splash.tsx");

    expect(source).toContain("isDesktopBackendManagedMode");
    expect(source).toContain("if (!isDesktopBackendManagedMode()) return");
    expect(source).toContain(
      "if (!shouldShowBackendSplash(status, isDesktopBackendManagedMode())) return null",
    );
  });
});
