"use client";
import { fileViewerRegistry } from "./viewer-registry";
import type { FileViewerProps } from "./protocol";
import { CodeMirrorViewer } from "@/components/better-sidebar/viewers/CodeMirrorViewer";
import { HtmlViewer } from "@/components/better-sidebar/viewers/HtmlViewer";
import { ImageViewer } from "@/components/better-sidebar/viewers/ImageViewer";
import { MarkdownViewer } from "@/components/better-sidebar/viewers/MarkdownViewer";
import { PdfViewer } from "@/components/better-sidebar/viewers/PdfViewer";
import type { FileEntryLike } from "./protocol";

// Built-in viewers are statically linked to keep first viewer open fast;
// extensions can still register additional viewers at runtime.
const BUILTINS = { CodeMirrorViewer, HtmlViewer, ImageViewer, MarkdownViewer, PdfViewer };

export function registerBuiltinViewers(): () => void {
  const disposers = [
    fileViewerRegistry.register({ id: "qilin:markdown", exts: [".md", ".markdown"], component: MarkdownViewer }),
    fileViewerRegistry.register({ id: "qilin:html", exts: [".html", ".htm"], component: HtmlViewer }),
    fileViewerRegistry.register({ id: "qilin:pdf", exts: [".pdf"], component: PdfViewer }),
    fileViewerRegistry.register({ id: "qilin:image", exts: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"], component: ImageViewer }),
    fileViewerRegistry.register({ id: "qilin:editor", exts: [".txt", ".json", ".yaml", ".yml", ".toml", ".ini", ".csv", ".tsv", ".sql", ".sh", ".py", ".ipynb", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".vue", ".css", ".scss", ".sass", ".less", ".rb", ".go", ".rs", ".java", ".kt", ".c", ".h", ".cpp", ".hpp", ".lua", ".php", ".r", ".scala"], component: CodeMirrorViewer, editable: true }),
  ];
  return () => disposers.forEach((d) => d());
}

// Re-export for tests.
export type { FileViewerProps, FileEntryLike };
