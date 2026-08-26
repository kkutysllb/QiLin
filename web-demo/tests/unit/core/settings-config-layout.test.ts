import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const repoRoot = resolve(__dirname, "../../..");

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("settings config layout", () => {
  test("prevents Radix scroll area content wrapper from expanding layouts", () => {
    const source = read("src/components/ui/scroll-area.tsx");

    expect(source).toContain("[&>div]:!block");
    expect(source).toContain("[&>div]:!min-w-0");
    expect(source).toContain("[&>div]:!w-full");
  });

  test("keeps the settings content column shrinkable", () => {
    const source = read(
      "src/components/workspace/settings/settings-view.tsx",
    );

    // Main content column must not expand the dialog horizontally.
    expect(source).toContain('className="flex min-w-0 flex-1 flex-col"');
    // Title container is truncatable.
    expect(source).toContain('className="min-w-0"');
    // Scroll area stays inside the flex column.
    expect(source).toContain('className="min-h-0 flex-1"');
  });

  test("wraps settings header actions before they can push content sideways", () => {
    const source = read(
      "src/components/workspace/settings/settings-view.tsx",
    );

    // Header is a flex row; the title block is min-w-0 so long titles
    // truncate instead of pushing the content column sideways.
    expect(source).toContain(
      'className="kworks-settings-header flex items-center gap-3 border-b px-8 py-5"',
    );
    expect(source).toContain('className="min-w-0"');
    expect(source).toMatch(/<h1 className="text-xl font-semibold">/);
  });

  test("wraps model config actions and truncates long model rows", () => {
    const source = read(
      "src/components/workspace/settings/models/models-settings-page.tsx",
    );

    // Long model names truncate inside a min-w-0 flex row.
    expect(source).toContain('className="min-w-0 flex-1"');
    expect(source).toContain('className="flex min-w-0 items-center gap-2"');
    expect(source).toContain('className="min-w-0 truncate text-sm font-medium"');
  });
});
