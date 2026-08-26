import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

describe("default query cache configuration", () => {
  test("keeps query data fresh briefly across page remounts", () => {
    const source = readFileSync(
      new URL("../../../src/components/query-client-provider.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("staleTime:");
    expect(source).toContain("DEFAULT_STALE_TIME_MS");
    expect(source).toContain("gcTime:");
  });
});
