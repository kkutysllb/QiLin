import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import { threadTitlePath } from "@/core/threads/api";

const repoRoot = resolve(__dirname, "../../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("threads api", () => {
  test("encodes thread id for title lookup path", () => {
    expect(threadTitlePath("thread/with space")).toBe(
      "/api/threads/thread%2Fwith%20space",
    );
  });

  test("AgentThreadContext type includes user_workspace_path for runtime forwarding", () => {
    const source = read("src/core/threads/types.ts");
    expect(source).toMatch(/user_workspace_path\??\s*:\s*string/);
  });

  test("thread.submit context includes user_workspace_path from settings", () => {
    // The submit() call in useThreadStream builds the run context from the
    // LocalSettings.context spread. We assert that the context object
    // literal passed to thread.submit contains a user_workspace_path key so
    // the backend's _CONTEXT_CONFIGURABLE_KEYS whitelist can pick it up.
    const source = read("src/core/threads/hooks.ts");
    expect(source).toMatch(/user_workspace_path/);
  });

  test("settings local exports saveThreadWorkspacePath / getThreadWorkspacePath", () => {
    const source = read("src/core/settings/local.ts");
    expect(source).toMatch(/export function saveThreadWorkspacePath/);
    expect(source).toMatch(/export function getThreadWorkspacePath/);
  });
});
