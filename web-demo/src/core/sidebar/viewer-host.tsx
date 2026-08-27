"use client";
import { fileViewerRegistry } from "./viewer-registry";
import { sidebarPanelRegistry } from "./panel-registry";
import type { FileViewerProps } from "./protocol";
import { FileViewerTab } from "@/components/better-sidebar/panels/FileViewerTab";
import { CodeMirrorViewer } from "@/components/better-sidebar/viewers/CodeMirrorViewer";
import { HtmlViewer } from "@/components/better-sidebar/viewers/HtmlViewer";
import { ImageViewer } from "@/components/better-sidebar/viewers/ImageViewer";
import { MarkdownViewer } from "@/components/better-sidebar/viewers/MarkdownViewer";
import { PdfViewer } from "@/components/better-sidebar/viewers/PdfViewer";
import type { FileEntryLike } from "./protocol";

// Built-in viewers are statically linked to keep first viewer open fast;
// extensions can still register additional viewers at runtime.
const BUILTINS = { CodeMirrorViewer, HtmlViewer, ImageViewer, MarkdownViewer, PdfViewer };

type PathPayload = { path: string };

/**
 * Registers the five built-in viewers in BOTH registries:
 *
 * - `fileViewerRegistry` — component dispatch used by BetterSidebarTab render;
 * - `sidebarPanelRegistry` (with `fileViewer` metadata) — so
 *   `sidebarPanelRegistry.matchFileViewer()` maps a double-clicked file to the
 *   right panel tab instead of falling back to `qilin:files`.
 *
 * Returns one disposer per registration: `[...fileDisposers, ...panelDisposers]`.
 */
export function registerBuiltinViewers(): Array<() => void> {
  const fileDisposers = [
    fileViewerRegistry.register({ id: "qilin:markdown", exts: [".md", ".markdown"], component: MarkdownViewer }),
    fileViewerRegistry.register({ id: "qilin:html", exts: [".html", ".htm"], component: HtmlViewer }),
    fileViewerRegistry.register({ id: "qilin:pdf", exts: [".pdf"], component: PdfViewer }),
    fileViewerRegistry.register({ id: "qilin:image", exts: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"], component: ImageViewer }),
    fileViewerRegistry.register({ id: "qilin:editor", exts: [".txt", ".json", ".yaml", ".yml", ".toml", ".ini", ".csv", ".tsv", ".sql", ".sh", ".py", ".ipynb", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".vue", ".css", ".scss", ".sass", ".less", ".rb", ".go", ".rs", ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".lua", ".php", ".r", ".scala"], component: CodeMirrorViewer, editable: true }),
  ];

  const renderFileViewerTab = (props: Parameters<typeof FileViewerTab>[0]) => (
    <FileViewerTab {...props} payload={(props.payload as PathPayload) ?? { path: "" }} />
  );

  const panelDisposers = [
    sidebarPanelRegistry.register({
      id: "qilin:markdown",
      title: () => "Markdown",
      order: 20,
      fileViewer: { exts: [".md", ".markdown"] },
      render: renderFileViewerTab,
    }),
    sidebarPanelRegistry.register({
      id: "qilin:html",
      title: () => "HTML",
      order: 21,
      fileViewer: { exts: [".html", ".htm"] },
      render: renderFileViewerTab,
    }),
    sidebarPanelRegistry.register({
      id: "qilin:pdf",
      title: () => "PDF",
      order: 22,
      fileViewer: { exts: [".pdf"] },
      render: renderFileViewerTab,
    }),
    sidebarPanelRegistry.register({
      id: "qilin:image",
      title: () => "Image",
      order: 23,
      fileViewer: { exts: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"] },
      render: renderFileViewerTab,
    }),
    sidebarPanelRegistry.register({
      id: "qilin:editor",
      title: () => "Editor",
      order: 24,
      fileViewer: { exts: [".txt", ".json", ".py", ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".md"] },
      render: renderFileViewerTab,
    }),
  ];

  return [...fileDisposers, ...panelDisposers];
}

// Re-export for tests.
export type { FileViewerProps, FileEntryLike };
