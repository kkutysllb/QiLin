import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = resolve(__dirname, "../../..");
const qilinRoot = resolve(repoRoot, "..", "qilin");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readQilin(path: string): string {
  return readFileSync(resolve(qilinRoot, path), "utf8");
}

describe("token-usage-budget settings page", () => {
  test("renders two Card sections (usage + budget)", () => {
    const source = read(
      "src/components/workspace/settings/token-usage-budget-settings-page.tsx",
    );

    expect(source).toContain("Token 使用统计");
    expect(source).toContain("Token 预算限制");

    expect(source).toContain("TokenUsageForm");
    expect(source).toContain("TokenBudgetForm");

    expect(source).toContain("useApplyAndRestart");
    expect(source).toContain("applyAndRestart");
  });

  test("settings-view routes tokenUsageBudget to the new page", () => {
    const source = read(
      "src/components/workspace/settings/settings-view.tsx",
    );

    expect(source).toContain(
      'import { TokenUsageBudgetSettingsPage } from "./token-usage-budget-settings-page"',
    );
    expect(source).toContain(
      'active.id === "tokenUsageBudget" && <TokenUsageBudgetSettingsPage />',
    );
    expect(source).toMatch(
      /id: "tokenUsageBudget"[^}]*groupKey: "engine"/,
    );
  });
});

describe("settings-view removes legacy token_usage", () => {
  test("no longer has token_usage NavItem or TokenUsageForm import", () => {
    // The old config-settings-page.tsx was removed in the settings
    // refactor — the legacy token_usage NavItem must not resurface
    // (tokenUsageBudget is the new replacement and is allowed).
    const source = read(
      "src/components/workspace/settings/settings-view.tsx",
    );

    expect(source).not.toMatch(/id:\s*["']token_usage["']/);
    expect(source).toMatch(/id:\s*["']tokenUsageBudget["']/);
  });
});

describe("token-budget-form config structure", () => {
  test("TokenBudgetForm has all TokenBudgetConfig fields", () => {
    const source = read(
      "src/components/workspace/settings/config/settings-forms/token-budget-form.tsx",
    );

    // TokenBudgetConfig interface
    expect(source).toContain("enabled: boolean");
    expect(source).toContain("max_tokens: number");
    expect(source).toContain("max_input_tokens: number | null");
    expect(source).toContain("max_output_tokens: number | null");
    expect(source).toContain("warn_threshold: number");
    expect(source).toContain("hard_stop_threshold: number");

    // Uses useConfigSection with "token_budget" section
    expect(source).toContain('"token_budget"');

    // Merge defaults pattern
    expect(source).toContain("...defaultConfig, ...rawData");

    // Client-side threshold validation
    expect(source).toContain("hard_stop_threshold < local.warn_threshold");
  });
});

describe("token-usage-budget i18n", () => {
  test("zh-CN has tokenUsageBudget keys", () => {
    const source = read("src/core/i18n/locales/zh-CN.ts");

    expect(source).toMatch(/sections:\s*\{[^}]*tokenUsageBudget:/s);
    expect(source).toMatch(/titles:\s*\{[^}]*tokenUsageBudget:/s);
    expect(source).toMatch(/summaries:\s*\{[^}]*tokenUsageBudget:/s);
  });

  test("en-US has tokenUsageBudget keys", () => {
    const source = read("src/core/i18n/locales/en-US.ts");

    expect(source).toMatch(/sections:\s*\{[^}]*tokenUsageBudget:/s);
    expect(source).toMatch(/titles:\s*\{[^}]*tokenUsageBudget:/s);
    expect(source).toMatch(/summaries:\s*\{[^}]*tokenUsageBudget:/s);
  });

  test("types.ts has tokenUsageBudget in sections, titles, and summaries", () => {
    const source = read("src/core/i18n/locales/types.ts");

    expect(source).toMatch(/sections:\s*\{[^}]*tokenUsageBudget:\s*string;/s);
    expect(source).toMatch(/titles:\s*\{[^}]*tokenUsageBudget:\s*string;/s);
    expect(source).toMatch(/summaries:\s*\{[^}]*tokenUsageBudget:\s*string;/s);
  });
});

describe("backend config_router registers token_budget", () => {
  test("SECTION_MODELS includes token_budget", () => {
    const source = readQilin("app/gateway/routers/config_router.py");

    expect(source).toContain(
      '"token_budget": "qilin.config.token_budget_config:TokenBudgetConfig"',
    );
    // token_usage was already registered
    expect(source).toContain(
      '"token_usage": "qilin.config.token_usage_config:TokenUsageConfig"',
    );
  });
});
