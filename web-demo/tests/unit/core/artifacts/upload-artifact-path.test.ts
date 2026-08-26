import { describe, expect, test } from "vitest";

import { uploadArtifactPath } from "@/core/artifacts/utils";

describe("uploadArtifactPath — normalize FileInMessage paths for the artifacts API", () => {
  test("virtual paths from new submissions pass through unchanged", () => {
    expect(
      uploadArtifactPath("/mnt/user-data/uploads/image.png", "image.png"),
    ).toBe("/mnt/user-data/uploads/image.png");
  });

  test("host-absolute paths persisted by older submissions are rebuilt from the filename", () => {
    // resolve_virtual_path rejects anything without the mnt/user-data prefix
    // (HTTP 400), so the physical upload dir path must never reach the API.
    expect(
      uploadArtifactPath(
        "/Users/dev/.kworks/threads/t1/uploads/image.png",
        "image.png",
      ),
    ).toBe("/mnt/user-data/uploads/image.png");

    expect(
      uploadArtifactPath("/data/threads/t1/uploads/截图.png", "截图.png"),
    ).toBe("/mnt/user-data/uploads/截图.png");
  });

  test("missing path falls back to the uploads virtual path", () => {
    expect(uploadArtifactPath(undefined, "photo.jpg")).toBe(
      "/mnt/user-data/uploads/photo.jpg",
    );
  });

  test("filename is sanitized to its basename", () => {
    expect(
      uploadArtifactPath(undefined, "../evil.png"),
    ).toBe("/mnt/user-data/uploads/evil.png");
  });

  test("prefix confusion is not treated as a virtual path", () => {
    // Segment-boundary match only — mnt/user-dataX is not the virtual root.
    expect(
      uploadArtifactPath("/mnt/user-dataX/uploads/a.png", "a.png"),
    ).toBe("/mnt/user-data/uploads/a.png");
  });
});
