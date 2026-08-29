import type { Message } from "@langchain/langgraph-sdk";

import { stripHumanInputFormValuesTrailer } from "./human-input";
import {
  extractContentFromMessage,
  extractReasoningContentFromMessage,
  findToolCallResult,
  isReasoningContentBlock,
  reasoningTextFromContentBlock,
  splitInlineReasoningInOrder,
  stripInternalContent,
  stripUploadedFilesTag,
  type FileInMessage,
} from "./utils";

/**
 * Segment model — the new rendering contract for chat messages.
 *
 * An assistant message is decomposed into segments in *execution order*
 * (Cursor/Cline style): reasoning first, then text and tool activity
 * interleaved the way the model actually produced them — the prose a model
 * writes before calling tools renders above those tool calls. Each segment
 * is rendered by a small dedicated block component, and streaming can
 * progressively reveal each part independently.
 *
 * A human message is rendered as a single {@link UserPromptSegment}.
 */

export type ToolActivityStep = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string | Record<string, unknown>;
};

export type MessageSegment =
  | { kind: "reasoning"; content: string }
  | {
      kind: "tool_activity";
      steps: ToolActivityStep[];
      /** Optional reasoning that accompanies the tool calls. */
      reasoning?: string;
    }
  | { kind: "prose"; content: string }
  | { kind: "files"; files: FileInMessage[] };

/** Segment for a human (user) message. */
export type UserPromptSegment = {
  kind: "user";
  content: string;
  files: FileInMessage[];
  /** Inline image URLs (data:/https:) carried by content `image_url` blocks, rendered as thumbnails instead of markdown text. */
  images: string[];
};

/** Tools whose results are surfaced elsewhere (subagent cards, artifacts). */
const DEFERRED_TOOLS = new Set(["task", "present_files"]);

type ToolCallLike = {
  id?: string;
  name: string;
  args: Record<string, unknown>;
};

/** Content-block shapes that carry a tool invocation (LC v1 `tool_call`, Anthropic `tool_use`). */
function isToolBlock(block: unknown): block is {
  type: string;
  id?: string;
  name?: string;
  input?: unknown;
  args?: unknown;
} {
  if (typeof block !== "object" || block === null) return false;
  const type = (block as { type?: unknown }).type;
  return type === "tool_call" || type === "tool_use";
}

function toolStepFromCall(
  toolCall: ToolCallLike,
  index: number,
  contextMessages: Message[],
): ToolActivityStep {
  const step: ToolActivityStep = {
    id: toolCall.id ?? `${toolCall.name}-${index}`,
    name: toolCall.name,
    args: toolCall.args ?? {},
  };
  if (toolCall.id) {
    const raw = findToolCallResult(toolCall.id, contextMessages);
    if (raw) {
      try {
        step.result = JSON.parse(raw);
      } catch {
        step.result = raw;
      }
    }
  }
  return step;
}

function appendSegment(
  segments: MessageSegment[],
  segment: MessageSegment,
): void {
  const last = segments[segments.length - 1];
  if (segment.kind === "tool_activity" && last?.kind === "tool_activity") {
    last.steps.push(...segment.steps);
    return;
  }
  if (segment.kind === "reasoning" && last?.kind === "reasoning") {
    last.content = [last.content, segment.content].filter(Boolean).join("\n\n");
    return;
  }
  if (segment.kind === "prose" && last?.kind === "prose") {
    last.content = [last.content, segment.content].filter(Boolean).join("\n");
    return;
  }
  segments.push(segment);
}

function pushSteps(
  segments: MessageSegment[],
  steps: ToolActivityStep[],
): void {
  if (steps.length === 0) return;
  appendSegment(segments, { kind: "tool_activity", steps });
}

/**
 * Decompose an assistant message into segments in *execution order* —
 * Cursor/Cline style: the text the model wrote before invoking tools
 * renders above those tool calls, never below them.
 *
 * Ordering rules:
 *  - Reasoning always comes first (it precedes the step's visible output).
 *  - Block-array content is walked in order, so interleaved
 *    `text → tool_call → text` blocks keep their true positions.
 *  - String content (or text-only blocks) has no positional information
 *    for `tool_calls`, which the model emits *after* the text — so prose
 *    renders before the tool steps.
 *
 * @param message            the AI message to render
 * @param contextMessages    sibling messages used to resolve tool results
 */
export function parseMessageSegments(
  message: Message,
  contextMessages: Message[] = [],
): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const content = message.content;
  const rawAdditionalReasoning =
    typeof message.additional_kwargs?.reasoning_content === "string"
      ? message.additional_kwargs.reasoning_content
      : null;

  const textFromTextBlock = (block: unknown): string | null => {
    if (
      typeof block !== "object" ||
      block === null ||
      (block as { type?: unknown }).type !== "text"
    ) {
      return null;
    }
    const text = (block as { text?: unknown }).text;
    return typeof text === "string" ? text : null;
  };

  const hasInlineReasoning = (text: string): boolean =>
    splitInlineReasoningInOrder(text).some((part) => part.kind === "reasoning");

  const hasPositionedReasoning =
    (typeof content === "string" && hasInlineReasoning(content)) ||
    (Array.isArray(content) &&
      content.some((block) => {
        const text = textFromTextBlock(block);
        return (
          isReasoningContentBlock(block) ||
          (text !== null && hasInlineReasoning(text))
        );
      }));

  const appendFallbackReasoning = () => {
    const cleaned = rawAdditionalReasoning
      ? stripInternalContent(rawAdditionalReasoning)
      : "";
    if (cleaned && !hasPositionedReasoning) {
      appendSegment(segments, { kind: "reasoning", content: cleaned });
    }
  };

  const toolCalls = ((message as { tool_calls?: unknown }).tool_calls ??
    []) as ToolCallLike[];
  const visibleToolCalls = toolCalls.filter(
    (toolCall) => !DEFERRED_TOOLS.has(toolCall.name),
  );

  const appendInlineParts = (text: string) => {
    for (const part of splitInlineReasoningInOrder(text)) {
      const cleaned = stripInternalContent(part.content);
      if (!cleaned) continue;
      appendSegment(segments, { kind: part.kind, content: cleaned });
    }
  };

  const hasOrderedArrayBlocks =
    Array.isArray(content) &&
    content.some((block) => {
      const text = textFromTextBlock(block);
      return (
        isToolBlock(block) ||
        isReasoningContentBlock(block) ||
        (text !== null && hasInlineReasoning(text))
      );
    });

  if (hasOrderedArrayBlocks) {
    appendFallbackReasoning();

    const emittedToolIds = new Set<string>();
    const textRun: string[] = [];
    const reasoningRun: string[] = [];
    let stepIndex = 0;

    const flushText = () => {
      const cleaned = stripInternalContent(textRun.join("\n").trim());
      textRun.length = 0;
      if (cleaned) {
        appendSegment(segments, { kind: "prose", content: cleaned });
      }
    };

    const flushReasoning = () => {
      const cleaned = stripInternalContent(reasoningRun.join("\n\n").trim());
      reasoningRun.length = 0;
      if (cleaned) {
        appendSegment(segments, { kind: "reasoning", content: cleaned });
      }
    };

    const appendTextBlock = (text: string) => {
      for (const part of splitInlineReasoningInOrder(text)) {
        if (part.kind === "reasoning") {
          flushText();
          reasoningRun.push(part.content);
        } else {
          flushReasoning();
          textRun.push(part.content);
        }
      }
    };

    for (const block of content as unknown[]) {
      if (isToolBlock(block)) {
        flushText();
        flushReasoning();
        if (block.id) emittedToolIds.add(block.id);
        const name = block.name ?? "tool";
        if (DEFERRED_TOOLS.has(name)) continue;
        appendSegment(segments, {
          kind: "tool_activity",
          steps: [
            toolStepFromCall(
              {
                id: block.id,
                name,
                args:
                  (block.args as Record<string, unknown> | undefined) ??
                  (block.input as Record<string, unknown> | undefined) ??
                  {},
              },
              stepIndex++,
              contextMessages,
            ),
          ],
        });
        continue;
      }

      if (isReasoningContentBlock(block)) {
        const reasoning = reasoningTextFromContentBlock(block);
        if (reasoning?.trim()) {
          flushText();
          reasoningRun.push(reasoning);
        }
        continue;
      }

      const text = textFromTextBlock(block);
      if (text !== null) {
        appendTextBlock(text);
      }
    }

    flushText();
    flushReasoning();

    const remaining = visibleToolCalls.filter(
      (toolCall) => !toolCall.id || !emittedToolIds.has(toolCall.id),
    );
    pushSteps(
      segments,
      remaining.map((toolCall, index) =>
        toolStepFromCall(toolCall, stepIndex + index, contextMessages),
      ),
    );
  } else if (typeof content === "string" && hasInlineReasoning(content)) {
    appendInlineParts(content);
    pushSteps(
      segments,
      visibleToolCalls.map((toolCall, index) =>
        toolStepFromCall(toolCall, index, contextMessages),
      ),
    );
  } else {
    appendFallbackReasoning();
    const rawProse = extractContentFromMessage(message);
    if (rawProse) {
      appendSegment(segments, { kind: "prose", content: rawProse });
    }
    pushSteps(
      segments,
      visibleToolCalls.map((toolCall, index) =>
        toolStepFromCall(toolCall, index, contextMessages),
      ),
    );
  }

  const files = message.additional_kwargs?.files as FileInMessage[] | undefined;
  if (Array.isArray(files) && files.length > 0) {
    segments.push({ kind: "files", files });
  }

  return segments;
}
/**
 * Parse a run of consecutive assistant messages into ONE segment stream —
 * the Cursor/Cline aggregation layer. Tool calls that are adjacent across
 * message boundaries (i.e. no prose chunk separates them) merge into a
 * single `tool_activity` segment so the UI shows exactly one ToolGroup
 * row per prose gap, regardless of how many AI messages the backend
 * emitted for that stretch of the turn.
 */
export function parseAssistantSegments(
  messages: Message[],
  contextMessages: Message[] = [],
): MessageSegment[] {
  const merged: MessageSegment[] = [];
  for (const message of messages) {
    if (message.type !== "ai") continue;
    for (const segment of parseMessageSegments(message, contextMessages)) {
      appendSegment(merged, segment);
    }
  }
  return merged;
}

/**
 * `![image](...)` markdown produced by {@link extractContentFromMessage}'s
 * `image_url` branch. Only data:image base64 and http(s) URLs are lifted out
 * for thumbnail rendering; any other scheme stays as plain text so a crafted
 * URL can never reach an `<img src>`.
 */
const INLINE_IMAGE_MD_RE =
  /!\[image\]\((data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s)]+)\)/g;

/**
 * Decompose a human message into a single user-prompt segment.
 *
 * Form submissions carry a trailing `[values: {...}]` JSON block (see
 * {@link buildHumanInputFormSubmissionValue}); the rendered bubble shows
 * only the readable summary above it.
 *
 * UploadsMiddleware prepends a `<current_uploads>` context block to the
 * checkpoint-persisted human message before it streams back, so the same
 * middleware tags stripped from AI prose are removed here too — the bubble
 * must show only what the user typed, with uploads rendered as file cards.
 * Content `image_url` blocks surface as `images` thumbnails rather than a
 * wall of base64 markdown text.
 */
export function parseUserPrompt(message: Message): UserPromptSegment {
  const raw =
    extractContentFromMessage(message) ??
    extractReasoningContentFromMessage(message) ??
    "";
  const sanitized = stripUploadedFilesTag(raw);
  const images: string[] = [];
  const withoutImages = sanitized.replace(
    INLINE_IMAGE_MD_RE,
    (_match, url: string) => {
      images.push(url);
      return "";
    },
  );
  const content = stripHumanInputFormValuesTrailer(withoutImages);
  const files =
    (message.additional_kwargs?.files as FileInMessage[] | undefined) ?? [];
  return { kind: "user", content, files, images };
}
