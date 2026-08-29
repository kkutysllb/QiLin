"use client";

import { memo } from "react";

import { MarkdownContent } from "@/components/workspace/messages/markdown-content";
import { cn } from "@/lib/utils";

/**
 * ProseContent — the assistant's natural-language answer, rendered with
 * the shared markdown pipeline (streamdown + streamdown-tight typography).
 */
export const ProseContent = memo(function ProseContent({
  content,
  isLoading = false,
  className,
}: {
  content: string;
  isLoading?: boolean;
  className?: string;
}) {
  if (!content) return null;

  return (
    <div className={cn("w-full min-w-0", className)}>
      <MarkdownContent
        content={content}
        isLoading={isLoading}
        className="streamdown-tight"
      />
    </div>
  );
});
