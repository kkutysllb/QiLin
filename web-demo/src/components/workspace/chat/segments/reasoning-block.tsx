"use client";

import { BrainIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { ClipboardSafeStreamdown } from "@/components/ai-elements/streamdown";
import { reasoningPlugins } from "@/core/streamdown/plugins";
import { cn } from "@/lib/utils";

function reasoningSummary(content: string): string {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "";
  return firstLine.length > 120 ? firstLine.slice(0, 117) + "…" : firstLine;
}

/**
 * ReasoningBlock — a compact, borderless DSH-style thinking row.
 * It stays collapsed by default so reasoning remains available without
 * interrupting the assistant's readable response flow.
 */
export function ReasoningBlock({
  content,
  isStreaming = false,
  className,
}: {
  content: string;
  isStreaming?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const summary = reasoningSummary(content);

  return (
    <div className={cn("w-full min-w-0", className)}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left text-sm leading-6 transition-colors",
          "text-muted-foreground hover:bg-muted/30 hover:text-foreground focus-visible:ring-ring focus-visible:ring-2",
          isStreaming && "text-primary",
        )}
      >
        <BrainIcon className="size-3.5 shrink-0" />
        <span className="shrink-0 font-medium">
          {isStreaming ? <Shimmer duration={1}>思考中</Shimmer> : "已思考"}
        </span>
        <span
          aria-hidden="true"
          className="bg-border size-1 shrink-0 rounded-full"
        />
        <span className="min-w-0 flex-1 truncate" title={summary}>
          {summary}
        </span>
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
      </button>
      {expanded && (
        <div className="text-muted-foreground border-border/40 mt-1 ml-6 max-h-96 overflow-auto border-l pl-3 text-[13px] leading-6">
          <ClipboardSafeStreamdown {...reasoningPlugins}>
            {content}
          </ClipboardSafeStreamdown>
        </div>
      )}
    </div>
  );
}
