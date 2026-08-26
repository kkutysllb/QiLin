// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/core/i18n/hooks", () => ({
  useI18n: () => ({
    t: { uploads: { uploading: "上传中" } },
  }),
}));
vi.mock("@/core/artifacts/authenticated-url", () => ({
  useAuthenticatedArtifactObjectUrl: vi.fn(() => undefined),
}));

import { FilesCard } from "@/components/workspace/chat/segments/files-card";

const THREAD_ID = "t1";

describe("FilesCard — non-image attachment chips", () => {
  test("uploaded PDF shows filename, type badge and the red document icon", () => {
    const { container } = render(
      <FilesCard
        threadId={THREAD_ID}
        files={[
          {
            filename: "report.pdf",
            size: 2048,
            path: "/mnt/user-data/uploads/report.pdf",
            status: "uploaded",
          },
        ]}
      />,
    );

    expect(screen.getByText("report.pdf")).toBeTruthy();
    expect(screen.getByTitle("report.pdf")).toBeTruthy();
    expect(screen.getByText("PDF")).toBeTruthy();
    expect(container.querySelector("svg.text-red-500")).toBeTruthy();
  });

  test("uploaded spreadsheet gets the green sheet icon, archives the amber one", () => {
    const { container } = render(
      <FilesCard
        threadId={THREAD_ID}
        files={[
          {
            filename: "数据.xlsx",
            size: 1024,
            path: "/mnt/user-data/uploads/数据.xlsx",
            status: "uploaded",
          },
          {
            filename: "bundle.zip",
            size: 4096,
            path: "/mnt/user-data/uploads/bundle.zip",
            status: "uploaded",
          },
        ]}
      />,
    );

    expect(screen.getByText("数据.xlsx")).toBeTruthy();
    expect(container.querySelector("svg.text-emerald-500")).toBeTruthy();
    expect(container.querySelector("svg.text-amber-500")).toBeTruthy();
  });

  test("uploading non-image chip shows the type icon and uploading hint", () => {
    const { container } = render(
      <FilesCard
        threadId={THREAD_ID}
        files={[
          {
            filename: "notes.md",
            size: 0,
            status: "uploading",
          },
        ]}
      />,
    );

    expect(screen.getByText("notes.md")).toBeTruthy();
    expect(screen.getByText("Markdown")).toBeTruthy();
    expect(screen.getByText("上传中")).toBeTruthy();
    expect(container.querySelector("svg.text-sky-500")).toBeTruthy();
  });

  test("unknown extension falls back to the generic violet file icon", () => {
    const { container } = render(
      <FilesCard
        threadId={THREAD_ID}
        files={[
          {
            filename: "mystery.xyz",
            size: 10,
            path: "/mnt/user-data/uploads/mystery.xyz",
            status: "uploaded",
          },
        ]}
      />,
    );

    expect(screen.getByText("XYZ")).toBeTruthy();
    expect(container.querySelector("svg.text-violet-500")).toBeTruthy();
  });
});

describe("FilesCard — image attachment chips", () => {
  test("uploading image renders the local thumbnail immediately", () => {
    render(
      <FilesCard
        threadId={THREAD_ID}
        files={[
          {
            filename: "截图.png",
            size: 0,
            status: "uploading",
            localUrl: "data:image/png;base64,xxxx",
            mediaType: "image/png",
          },
        ]}
      />,
    );

    expect(screen.getByAltText("截图.png")).toBeTruthy();
  });

  test("uploaded image falls back to the local URL while the authenticated URL resolves", () => {
    render(
      <FilesCard
        threadId={THREAD_ID}
        files={[
          {
            filename: "photo.jpg",
            size: 512,
            path: "/mnt/user-data/uploads/photo.jpg",
            status: "uploaded",
            localUrl: "blob:preview",
          },
        ]}
      />,
    );

    expect(screen.getByAltText("photo.jpg")).toBeTruthy();
    expect(screen.getByAltText("photo.jpg").getAttribute("src")).toBe(
      "blob:preview",
    );
  });
});
