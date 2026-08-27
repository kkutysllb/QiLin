"use client";
import { Streamdown } from "streamdown";
// unified-ecosystem packages ship default exports only (named imports would be undefined at runtime).
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import type { FC } from "react";
import type { FileViewerProps } from "@/core/sidebar/protocol";

const MarkdownViewer: FC<FileViewerProps> = ({ content }) => (
  <div className="prose prose-sm dark:prose-invert h-full overflow-auto p-4">
    <Streamdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeRaw]}
      components={{ pre: ({ children }) => <pre className="mermaid">{children}</pre> }}
    >
      {content as string}
    </Streamdown>
  </div>
);

export { MarkdownViewer };
export default MarkdownViewer;
