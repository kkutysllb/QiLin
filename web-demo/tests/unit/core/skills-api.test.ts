import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = resolve(__dirname, "../../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

const REMOVED_WIZARD_COMPONENTS = [
  // The standalone skill-creation wizard was removed in the
  // "dual-mode skill install" refactor — skill creation now lives in the
  // agent wizard (agent-wizard-dialog.tsx) and the skills settings page.
  "src/components/workspace/skills/create-skill-wizard.tsx",
] as const;

describe("skills api", () => {
  test("skills api exports createSkill for the wizard", () => {
    // Source-level check so this test does not pull in the fetcher
    // (which depends on the browser environment).
    const source = read("src/core/skills/api.ts");
    expect(source).toMatch(/export async function createSkill/);
    expect(source).toMatch(/POST/);
    expect(source).toMatch(/\/api\/skills\/custom/);
  });

  test("skills hooks exports useCreateSkill", () => {
    const source = read("src/core/skills/hooks.ts");
    expect(source).toMatch(/export function useCreateSkill/);
    // The mutation must invalidate the skills query so the new skill
    // appears in the management list immediately.
    expect(source).toMatch(/\["skills"\]/);
  });

  test("skills type defines CreateSkillRequest with required fields", () => {
    const source = read("src/core/skills/type.ts");
    expect(source).toMatch(/name:\s*string/);
    expect(source).toMatch(/description:\s*string/);
    expect(source).toMatch(/content:\s*string/);
  });

  test("templates module exports at least blank / task / coding builtins", () => {
    const source = read("src/core/skills/templates.ts");
    expect(source).toMatch(/id:\s*"blank"/);
    expect(source).toMatch(/id:\s*"task"/);
    expect(source).toMatch(/id:\s*"coding"/);
  });

  test("templates module exports buildCopyTemplate for copy-from-existing", () => {
    const source = read("src/core/skills/templates.ts");
    expect(source).toMatch(/export function buildCopyTemplate/);
  });

  test("standalone skill-creation wizard component was removed", () => {
    for (const componentPath of REMOVED_WIZARD_COMPONENTS) {
      expect(existsSync(resolve(repoRoot, componentPath))).toBe(false);
    }
    // The creation API surface survives (agent wizard / settings UI
    // consume useCreateSkill instead of a dedicated wizard page).
    const hooks = read("src/core/skills/hooks.ts");
    expect(hooks).toMatch(/export function useCreateSkill/);
  });

  test("skills index re-exports createSkill and templates", () => {
    const source = read("src/core/skills/index.ts");
    expect(source).toMatch(/from "\.\/api"/);
    expect(source).toMatch(/from "\.\/hooks"/);
    expect(source).toMatch(/from "\.\/templates"/);
  });

  test("skills api exports installSkillFromUpload for the package-install flow", () => {
    const source = read("src/core/skills/api.ts");
    expect(source).toMatch(/export async function installSkillFromUpload/);
    expect(source).toMatch(/\/api\/skills\/install-upload/);
  });

  test("skills api exports uploadSupportFiles for the scripts flow", () => {
    const source = read("src/core/skills/api.ts");
    expect(source).toMatch(/export async function uploadSupportFiles/);
    expect(source).toMatch(/support-files/);
  });

  test("skills hooks export the two new wizard mutations", () => {
    const source = read("src/core/skills/hooks.ts");
    expect(source).toMatch(/export function useInstallSkillFromUpload/);
    expect(source).toMatch(/export function useUploadSupportFiles/);
  });

  test("skills type defines CreateMode and SupportSubdir", () => {
    const source = read("src/core/skills/type.ts");
    expect(source).toMatch(/type CreateMode\b/);
    expect(source).toMatch(/type SupportSubdir\b/);
    expect(source).toMatch(/SUPPORT_SUBDIRS/);
  });
});
