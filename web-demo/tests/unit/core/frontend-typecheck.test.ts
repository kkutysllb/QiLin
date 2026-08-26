import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, "../../../package.json"), "utf-8"),
) as { scripts: Record<string, string> };
const typecheckScriptPath = resolve(__dirname, "../../../scripts/typecheck.mjs");
const typecheckScript = existsSync(typecheckScriptPath)
  ? readFileSync(typecheckScriptPath, "utf-8")
  : "";

describe("frontend typecheck", () => {
  test("clears stale Next.js type cache before running TypeScript", () => {
    expect(packageJson.scripts.typecheck).toBe("node scripts/typecheck.mjs");
    expect(typecheckScript).toContain('join(ROOT, ".next")');
    expect(typecheckScript).toContain("rmSync(nextDir");
    expect(typecheckScript).toContain('"exec", "tsc", "--noEmit"');
  });
});
