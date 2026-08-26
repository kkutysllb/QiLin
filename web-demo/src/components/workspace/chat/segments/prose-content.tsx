"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { memo, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/workspace/messages/markdown-content";
import { cn } from "@/lib/utils";

/**
* ProseContent — the assistant's natural-language answer, rendered with
* the shared markdown pipeline (streamdown + streamdown-tight typography).
* While streaming, a neural-wave spinner trails the text.
*/
export const ProseContent = memo(
  function ProseContent({
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
      <ProseContentInner
        content={content}
        isLoading={isLoading}
        className={className}
      />
    );
  },
);

/**
 * Inner component that owns the copy state and the hover group.
 * The copy button is absolutely positioned so it never adds layout height.
 */
function ProseContentInner({
  content,
  isLoading,
  className,
}: {
  content: string;
  isLoading: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [content]);

  return (
    <div className={cn("group/prose relative w-full", className)}>
      <MarkdownContent
        content={content}
        isLoading={isLoading}
        className="streamdown-tight"
      />
      {/* Streaming animation lives at the bottom of the message feed so
          there is exactly one spinner visible per turn, regardless of
          which segment type happens to be active. */}
      {!isLoading && (
        <div className="absolute -top-1 right-0 flex items-center opacity-0 transition-opacity group-hover/prose:opacity-100">
          <Button
            size="icon-sm"
            type="button"
            variant="ghost"
            aria-label={copied ? "已复制" : "复制"}
            title={copied ? "已复制" : "复制"}
            onClick={handleCopy}
          >
            {copied ? (
              <CheckIcon className="text-emerald-500 size-3" />
            ) : (
              <CopyIcon className="text-muted-foreground size-3" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
