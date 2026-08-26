"use client";

import { memo } from "react";

import type { MessageSegment } from "@/core/messages/segments";
import { tryExtractInlineHumanInputForm } from "@/core/messages/utils";

import { HumanInputCard } from "../../messages/human-input-card";

import { FilesCard } from "./files-card";
import { ProseContent } from "./prose-content";
import { ReasoningBlock } from "./reasoning-block";
import { ToolGroup } from "./tool-group";

/**
 * SegmentList — renders an ordered segment stream (reasoning / prose /
 * tool groups / files) exactly as parsed, preserving the execution-order
 * interleaving between prose chunks and tool activity.
 */
export const SegmentList = memo(
  function SegmentList({
    segments,
    threadId,
    isLoading = false,
  }: {
    segments: MessageSegment[];
    threadId: string;
    isLoading?: boolean;
  }) {
    return (
      <>
        {segments.map((segment, index) => {
          switch (segment.kind) {
            case "reasoning":
              return (
                <ReasoningBlock
                  key={`reasoning-${index}`}
                  content={segment.content}
                  isStreaming={isLoading}
                />
              );
            case "tool_activity":
              return (
                <ToolGroup
                  key={`tools-${index}`}
                  steps={segment.steps}
                  isLoading={isLoading}
                />
              );
            case "prose": {
              // If the assistant wrote a structured clarification as
              // plain markdown instead of calling ask_clarification,
              // render it as an interactive form card.
              const inlineForm = tryExtractInlineHumanInputForm(
                segment.content,
              );
              if (inlineForm) {
                return (
                  <HumanInputCard
                    key={`form-${index}`}
                    request={inlineForm}
                  />
                );
              }
              return (
                <ProseContent
                  key={`prose-${index}`}
                  content={segment.content}
                  isLoading={isLoading}
                />
              );
            }
            case "files":
              return (
                <FilesCard
                  key={`files-${index}`}
                  files={segment.files}
                  threadId={threadId}
                />
              );
          }
        })}
      </>
    );
  },
);
