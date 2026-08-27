import { afterEach, describe, expect, test } from "vitest";
import { fileViewerRegistry } from "@/core/sidebar/viewer-registry";

const V_MD = { id: "v:md", exts: [".md"], component: () => null };
const V_JSON = { id: "v:json", exts: [".json"], component: () => null, match: (e: { name: string }) => e.name.endsWith(".json") };

afterEach(() => fileViewerRegistry.list().forEach((v) => fileViewerRegistry.unregister(v.id)));

describe("FileViewerRegistry", () => {
  test("matchExt by case-insensitive extension", () => {
    fileViewerRegistry.register(V_MD);
    expect(fileViewerRegistry.matchExt("README.MD")?.id).toBe("v:md");
  });

  test("match() takes precedence over exts", () => {
    fileViewerRegistry.register(V_JSON);
    const found = fileViewerRegistry.match({ name: "x.json", type: "file", size: 0, mtime: 0, mime: null });
    expect(found?.id).toBe("v:json");
  });

  test("match returns undefined when nothing matches", () => {
    fileViewerRegistry.register(V_MD);
    const found = fileViewerRegistry.match({ name: "x.png", type: "file", size: 0, mtime: 0, mime: null });
    expect(found).toBeUndefined();
  });
});
