"use client";
import type { FC } from "react";
import type { FileViewerProps } from "@/core/sidebar/protocol";

// Sandbox iframe — same-origin so DOMPurify-cleaned local content can lay out,
// scripts disabled. Suitable for HTML+CSS+inline SVG previews.
const HtmlViewer: FC<FileViewerProps> = ({ content }) => (
  <iframe
    title="html-preview"
    sandbox="allow-same-origin"
    srcDoc={content as string}
    className="h-full w-full border-0 bg-white"
  />
);

export { HtmlViewer };
export default HtmlViewer;
