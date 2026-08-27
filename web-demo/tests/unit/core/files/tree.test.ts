import { describe, expect, test } from "vitest";

import { sortEntries, joinRel, parentRel } from "@/core/files/tree";

describe("files/tree", () => {
  test("sortEntries: dirs first, then files, both case-insensitive", () => {
    const out = sortEntries([
      { name: "z.txt", type: "file", size: 0, mtime: 0, mime: null },
      { name: "A", type: "dir", size: 0, mtime: 0, mime: null },
      { name: "a", type: "dir", size: 0, mtime: 0, mime: null },
      { name: "b.md", type: "file", size: 0, mtime: 0, mime: null },
    ]);
    expect(out.map((e) => e.name)).toEqual(["a", "A", "b.md", "z.txt"]);
  });

  test("joinRel normalizes redundant separators", () => {
    expect(joinRel("src", "lib/")).toBe("src/lib");
    expect(joinRel("", "lib")).toBe("lib");
  });

  test("parentRel strips last segment", () => {
    expect(parentRel("src/lib/foo.py")).toBe("src/lib");
    expect(parentRel("foo.py")).toBe("");
  });
});
