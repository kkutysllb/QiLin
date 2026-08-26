"use client";

import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";

import { streamdownPlugins } from "@/core/streamdown";
import { toStreamdownComponents } from "@/core/streamdown/components";

import { ArtifactLink } from "../citations/artifact-link";

/**
 * HTML/Markdown 文件内容预览。
 * - HTML：文本内容 → blob URL → sandbox iframe（允许脚本，可运行内嵌 ECharts）
 * - Markdown：Streamdown 渲染
 * 在 Artifact 面板与聊天内联报告卡片中复用。
 */
export function ArtifactFilePreview({
  content,
  language,
}: {
  content: string;
  language: string;
}) {
  const [htmlPreviewUrl, setHtmlPreviewUrl] = useState<string>();

  useEffect(() => {
    if (language !== "html") {
      setHtmlPreviewUrl(undefined);
      return;
    }

    const blob = new Blob([content ?? ""], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setHtmlPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [content, language]);

  if (language === "markdown") {
    return (
      <div className="size-full px-4">
        <Streamdown
          className="size-full"
          {...streamdownPlugins}
          components={toStreamdownComponents({ a: ArtifactLink })}
        >
          {content ?? ""}
        </Streamdown>
      </div>
    );
  }
  if (language === "html") {
    return (
      <iframe
        className="size-full"
        title="Artifact preview"
        sandbox="allow-scripts allow-forms"
        src={htmlPreviewUrl}
      />
    );
  }
  return null;
}
