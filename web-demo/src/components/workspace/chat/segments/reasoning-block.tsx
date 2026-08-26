"use client";

import { BrainIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { ClipboardSafeStreamdown } from "@/components/ai-elements/streamdown";
import { reasoningPlugins } from "@/core/streamdown/plugins";
import { cn } from "@/lib/utils";


/**
 * ReasoningBlock — collapsible "thinking" segment.
 * Left accent border (emerald when done / blue while streaming),
 * inline summary chip, italic muted content.
 *
 * Always collapsed by default — during execution and after completion —
 * so thinking never interrupts the reading flow; the user expands it
 * manually.
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

  return (
    <div
      className={cn(
        "border-l-2 border-emerald-500/25 pl-3",
        isStreaming && "border-blue-500/50",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "inline-flex items-center gap-1.5 border-none bg-transparent px-2 py-1 text-xs transition-colors",
          "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          isStreaming && "text-blue-500 hover:text-blue-400",
        )}
      >
        <BrainIcon className="size-3.5" />
        <span>{isStreaming ? <Shimmer duration={1}>思考中…</Shimmer> : "已思考"}</span>
        <ChevronRightIcon
          className={cn(
            "size-3 transition-transform duration-150",
            expanded && "rotate-90",
          )}
        />
      </button>
      {expanded && (
        <div className="text-muted-foreground mt-2 text-[13px] leading-7 italic">
          <ClipboardSafeStreamdown {...reasoningPlugins}>{content}</ClipboardSafeStreamdown>
        </div>
      )}
    </div>
  );
}
