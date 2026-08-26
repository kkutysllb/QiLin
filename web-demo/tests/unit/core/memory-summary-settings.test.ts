import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = resolve(__dirname, "../../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("memory-summary settings page", () => {
  test("renders four Card sections (config, facts, summarization, title)", () => {
    const source = read(
      "src/components/workspace/settings/memory-summary-settings-page.tsx",
    );

    // Four cards with correct titles
    expect(source).toContain("记忆配置");
    expect(source).toContain("记忆事实管理");
    expect(source).toContain("对话摘要");
    expect(source).toContain("标题生成");

    // Imports all components
    expect(source).toContain("MemoryForm");
    expect(source).toContain("MemoryFactsManager");
    expect(source).toContain("SummarizationForm");
    expect(source).toContain("TitleForm");

    // Reuses the apply-and-restart hook
    expect(source).toContain("useApplyAndRestart");
    expect(source).toContain("applyAndRestart");
  });

  test("settings-view routes memorySummary to the new page", () => {
    const source = read(
      "src/components/workspace/settings/settings-view.tsx",
    );

    expect(source).toContain(
      'import { MemorySummarySettingsPage } from "./memory-summary-settings-page"',
    );
    expect(source).toContain(
      'active.id === "memorySummary" && <MemorySummarySettingsPage />',
    );
    // memorySummary is in the engine group
    expect(source).toMatch(
      /id: "memorySummary"[^}]*groupKey: "engine"/,
    );
  });
});

describe("memory-summary i18n", () => {
  test("zh-CN has memorySummary keys in sections, titles, and summaries", () => {
    const source = read("src/core/i18n/locales/zh-CN.ts");

    expect(source).toMatch(/sections:\s*\{[^}]*memorySummary:/s);
    expect(source).toMatch(/titles:\s*\{[^}]*memorySummary:/s);
    expect(source).toMatch(/summaries:\s*\{[^}]*memorySummary:/s);
  });

  test("en-US has memorySummary keys in sections, titles, and summaries", () => {
    const source = read("src/core/i18n/locales/en-US.ts");

    expect(source).toMatch(/sections:\s*\{[^}]*memorySummary:/s);
    expect(source).toMatch(/titles:\s*\{[^}]*memorySummary:/s);
    expect(source).toMatch(/summaries:\s*\{[^}]*memorySummary:/s);
  });

  test("types.ts has memorySummary in titles and summaries type blocks", () => {
    const source = read("src/core/i18n/locales/types.ts");

    expect(source).toMatch(/titles:\s*\{[^}]*memorySummary:\s*string;/s);
    expect(source).toMatch(/summaries:\s*\{[^}]*memorySummary:\s*string;/s);
  });
});

describe("old memory page fully removed", () => {
  test("memory-settings-page.tsx is not imported anywhere", () => {
    const files = [
      "src/components/workspace/settings/settings-view.tsx",
      "src/components/workspace/settings/index.ts",
    ];

    for (const f of files) {
      const source = read(f);
      expect(source).not.toContain("memory-settings-page");
    }
  });

  test("settings.memory.* i18n block is removed from zh-CN", () => {
    const source = read("src/core/i18n/locales/zh-CN.ts");
    // The old block had nested keys like markdown.table.confidenceLevel
    expect(source).not.toContain("confidenceLevel");
    // No standalone memory: { block inside settings (memorySummary: is fine)
    expect(source).not.toMatch(/\bmemory:\s*\{/);
  });

  test("settings.memory.* i18n block is removed from en-US", () => {
    const source = read("src/core/i18n/locales/en-US.ts");
    expect(source).not.toContain("confidenceLevel");
    expect(source).not.toMatch(/\bmemory:\s*\{/);
  });

  test("settings-view no longer has title or memory NavItems", () => {
    // The old config-settings-page.tsx was removed in the settings
    // refactor — its former "title"/"memory" sub-pages must not resurface
    // as NavItems (memorySummary is the new replacement and is allowed).
    const source = read(
      "src/components/workspace/settings/settings-view.tsx",
    );

    expect(source).not.toMatch(/id:\s*["']title["']/);
    expect(source).not.toMatch(/id:\s*["']memory["']/);
  });
});

describe("memory-facts-manager data operations", () => {
  test("uses core/memory hooks for CRUD operations", () => {
    const source = read(
      "src/components/workspace/settings/memory-facts-manager.tsx",
    );

    // Uses all the memory hooks
    expect(source).toContain("useMemory()");
    expect(source).toContain("useClearMemory()");
    expect(source).toContain("useCreateMemoryFact()");
    expect(source).toContain("useDeleteMemoryFact()");
    expect(source).toContain("useUpdateMemoryFact()");
    expect(source).toContain("useImportMemory()");
    expect(source).toContain("exportMemory");
  });

  test("provides search, create, edit, delete, clear, import, export", () => {
    const source = read(
      "src/components/workspace/settings/memory-facts-manager.tsx",
    );

    // Search
    expect(source).toContain("搜索记忆事实");
    // Create
    expect(source).toContain("新增事实");
    // Edit
    expect(source).toContain("openEdit");
    // Delete
    expect(source).toContain("setFactToDelete");
    // Clear all
    expect(source).toContain("清空");
    // Import
    expect(source).toContain("导入");
    // Export
    expect(source).toContain("导出");
  });
});

describe("memory-form backend config structure", () => {
  test("MemoryForm aligns with host-shared + backend_config dual-layer", () => {
    const source = read(
      "src/components/workspace/settings/config/settings-forms/memory-form.tsx",
    );

    // Host-shared fields
    expect(source).toContain("enabled: boolean");
    expect(source).toContain('mode: "middleware" | "tool"');
    expect(source).toContain("injection_enabled: boolean");
    expect(source).toContain("shutdown_flush_timeout_seconds: number");
    expect(source).toContain("manager_class: string");

    // backend_config fields (QiLinMem private)
    expect(source).toContain("backend_config: MemoryBackendConfig");
    expect(source).toContain("max_facts: number");
    expect(source).toContain("fact_confidence_threshold: number");
    expect(source).toContain("max_injection_tokens: number");
    expect(source).toContain("debounce_seconds: number");
    expect(source).toContain('token_counting: "tiktoken" | "char"');
    expect(source).toContain("staleness_review_enabled: boolean");
    expect(source).toContain("staleness_age_days: number");
    expect(source).toContain("consolidation_enabled: boolean");

    // mergeBackendConfig handles partial backend responses
    expect(source).toContain("mergeBackendConfig");
  });
});

describe("summarization-form config structure", () => {
  test("SummarizationForm has trigger and keep ContextSize", () => {
    const source = read(
      "src/components/workspace/settings/config/settings-forms/summarization-form.tsx",
    );

    // ContextSize type with fraction/tokens/messages
    expect(source).toContain('type ContextSizeType = "fraction" | "tokens" | "messages"');
    expect(source).toContain("interface ContextSize");

    // SummarizationConfig fields
    expect(source).toContain("trim_tokens_to_summarize: number | null");
    expect(source).toContain("trigger: ContextSize | null");
    expect(source).toContain("keep: ContextSize");

    // trigger and keep have type+value paired inputs
    expect(source).toContain("updateTrigger");
    expect(source).toContain("updateKeep");
  });
});

describe("title-form config structure", () => {
  test("TitleForm has all TitleConfig fields including model_name", () => {
    const source = read(
      "src/components/workspace/settings/config/settings-forms/title-form.tsx",
    );

    // TitleConfig interface
    expect(source).toContain("enabled: boolean");
    expect(source).toContain("max_words: number");
    expect(source).toContain("max_chars: number");
    expect(source).toContain("model_name: string | null");

    // Has loading state
    expect(source).toContain("if (loading)");
    expect(source).toContain("Loader2Icon");
  });
});
