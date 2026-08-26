import type { AIMessage, Message } from "@langchain/langgraph-sdk";

import type { HumanInputField, HumanInputOption, HumanInputRequest } from "./human-input";

interface GenericMessageGroup<T = string> {
  type: T;
  id: string | undefined;
  messages: Message[];
}

interface HumanMessageGroup extends GenericMessageGroup<"human"> {}

interface AssistantProcessingGroup extends GenericMessageGroup<"assistant:processing"> {}

interface AssistantMessageGroup extends GenericMessageGroup<"assistant"> {}

interface AssistantPresentFilesGroup extends GenericMessageGroup<"assistant:present-files"> {}

interface AssistantClarificationGroup extends GenericMessageGroup<"assistant:clarification"> {}

interface AssistantSubagentGroup extends GenericMessageGroup<"assistant:subagent"> {}

export type MessageGroup =
  | HumanMessageGroup
  | AssistantProcessingGroup
  | AssistantMessageGroup
  | AssistantPresentFilesGroup
  | AssistantClarificationGroup
  | AssistantSubagentGroup;

export function groupMessages<T>(
  messages: Message[],
  mapper: (group: MessageGroup) => T,
  { isCurrentTurnLoading = false }: { isCurrentTurnLoading?: boolean } = {},
): T[] {
  if (messages.length === 0) {
    return [];
  }

  const groups: MessageGroup[] = [];
  let groupIndex = 0;

  function nextGroupId(messageId: string | undefined): string {
    return `${messageId ?? "unknown"}--${groupIndex++}`;
  }

  // When the current turn is still streaming, find the index of the human
  // message that kicked it off. A content-only AI message inside that turn may
  // still get a tool call appended later, so it must stay in the processing
  // group rather than becoming a terminal assistant bubble (otherwise its
  // visible text jumps from the bubble into the steps panel when the tool call
  // arrives — #4304).
  let currentTurnStartIndex = -1;
  if (isCurrentTurnLoading) {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message?.type === "human" && !isHiddenFromUIMessage(message)) {
        currentTurnStartIndex = index;
        break;
      }
    }
  }

  // Returns the last group if it can still accept tool messages
  // (i.e. it's an in-flight processing group, not a terminal human/assistant group).
  function lastOpenGroup() {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.type !== "human" &&
      last.type !== "assistant" &&
      last.type !== "assistant:clarification"
    ) {
      return last;
    }
    return null;
  }

  for (const [messageIndex, message] of messages.entries()) {
    if (isHiddenFromUIMessage(message)) {
      continue;
    }

    if (message.type === "human") {
      groups.push({ id: nextGroupId(message.id), type: "human", messages: [message] });
      continue;
    }

    if (message.type === "tool") {
      if (isClarificationToolMessage(message)) {
        // Add to the preceding processing group to preserve tool-call association,
        // then also open a standalone clarification group for prominent display.
        lastOpenGroup()?.messages.push(message);
        groups.push({
          id: nextGroupId(message.id),
          type: "assistant:clarification",
          messages: [message],
        });
      } else {
        const open = lastOpenGroup();
        if (open) {
          open.messages.push(message);
        } else {
          // Fallback for orphan tool messages — LangGraph `messages-tuple` can
          // emit tool-result events out of order or replay them from subagent
          // state. When that happens, the tool message arrives after a terminal
          // group and lastOpenGroup() returns null. Previously we dropped the
          // message with console.warn, silently hiding the tool result from the
          // UI. Attach to the most recent group instead so the user can still
          // see what the agent did; if there is no group yet (history pagination
          // cut mid-turn, or only hidden messages preceded it), open a
          // processing group to keep it visible.
          const lastGroup = groups[groups.length - 1];
          if (lastGroup) {
            lastGroup.messages.push(message);
          } else {
            groups.push({
              id: nextGroupId(message.id),
              type: "assistant:processing",
              messages: [message],
            });
          }
        }
      }
      continue;
    }

    if (message.type === "ai") {
      // A message with answer content and no tool calls becomes its own
      // assistant bubble below, which already renders the message's
      // reasoning_content inside the bubble's collapsible. Such a message must
      // NOT also feed the processing group, or the ChainOfThought panel above
      // the bubble paints the identical reasoning a second time (#3868). A
      // content-only message that is still streaming (its turn is loading) is
      // kept in the processing group so visible text does not jump into the
      // steps panel when a tool call arrives later (#4304).
      const isUnresolvedAssistantText =
        currentTurnStartIndex >= 0 &&
        messageIndex > currentTurnStartIndex &&
        hasContent(message) &&
        !hasToolCalls(message);
      const becomesAssistantBubble =
        hasContent(message) &&
        !hasToolCalls(message) &&
        !isUnresolvedAssistantText;

      if (hasPresentFiles(message)) {
        groups.push({
          id: nextGroupId(message.id),
          type: "assistant:present-files",
          messages: [message],
        });
      } else if (hasSubagent(message)) {
        groups.push({
          id: nextGroupId(message.id),
          type: "assistant:subagent",
          messages: [message],
        });
      } else if (
        !becomesAssistantBubble &&
        (hasReasoning(message) ||
          hasToolCalls(message) ||
          isUnresolvedAssistantText)
      ) {
        const lastGroup = groups[groups.length - 1];
        // Accumulate consecutive intermediate AI messages into one processing group.
        if (lastGroup?.type !== "assistant:processing") {
          groups.push({
            id: nextGroupId(message.id),
            type: "assistant:processing",
            messages: [message],
          });
        } else {
          lastGroup.messages.push(message);
        }
      }

      if (becomesAssistantBubble) {
        groups.push({ id: nextGroupId(message.id), type: "assistant", messages: [message] });
      }
    }
  }

  return groups
    .map(mapper)
    .filter((result) => result !== undefined && result !== null) as T[];
}

export function extractTextFromMessage(message: Message) {
  if (typeof message.content === "string") {
    return (
      splitInlineReasoningFromAIMessage(message)?.content ??
      message.content.trim()
    );
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((content) => (content.type === "text" ? content.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

function splitInlineReasoning(content: string) {
  const reasoningParts: string[] = [];
  const visibleParts: string[] = [];
  const lowerContent = content.toLowerCase();
  let cursor = 0;

  while (cursor < content.length) {
    const openIndex = lowerContent.indexOf(THINK_OPEN_TAG, cursor);
    if (openIndex === -1) {
      visibleParts.push(content.slice(cursor));
      break;
    }

    visibleParts.push(content.slice(cursor, openIndex));

    const reasoningStart = openIndex + THINK_OPEN_TAG.length;
    const closeIndex = lowerContent.indexOf(THINK_CLOSE_TAG, reasoningStart);
    const reasoningEnd = closeIndex === -1 ? content.length : closeIndex;
    const normalized = content.slice(reasoningStart, reasoningEnd).trim();
    if (normalized) {
      reasoningParts.push(normalized);
    }

    if (closeIndex === -1) {
      cursor = content.length;
    } else {
      cursor = closeIndex + THINK_CLOSE_TAG.length;
    }
  }

  const cleaned = visibleParts.join("").trim();

  return {
    content: cleaned,
    reasoning: reasoningParts.length > 0 ? reasoningParts.join("\n\n") : null,
  };
}

function splitInlineReasoningFromAIMessage(message: Message) {
  if (message.type !== "ai" || typeof message.content !== "string") {
    return null;
  }
  return splitInlineReasoning(message.content);
}

export function extractContentFromMessage(message: Message) {
  const sanitizeForDisplay = (content: string) =>
    message.type === "human" ? content : stripInternalContent(content);

  if (typeof message.content === "string") {
    return sanitizeForDisplay(
      splitInlineReasoningFromAIMessage(message)?.content ??
      message.content.trim()
    );
  }
  if (Array.isArray(message.content)) {
    return sanitizeForDisplay(
      message.content
        .map((content) => {
          switch (content.type) {
            case "text":
              return content.text;
            case "image_url":
              const imageURL = extractURLFromImageURLContent(content.image_url);
              return `![image](${imageURL})`;
            default:
              return "";
          }
        })
        .join("\n")
        .trim(),
    );
  }
  return "";
}

export function extractReasoningContentFromMessage(message: Message) {
  if (message.type !== "ai") {
    return null;
  }
  if (
    message.additional_kwargs &&
    "reasoning_content" in message.additional_kwargs
  ) {
    return message.additional_kwargs.reasoning_content as string | null;
  }
  if (Array.isArray(message.content)) {
    const part = message.content[0];
    if (part && "thinking" in part) {
      return part.thinking as string;
    }
  }
  if (typeof message.content === "string") {
    return splitInlineReasoning(message.content).reasoning;
  }
  return null;
}

export function removeReasoningContentFromMessage(message: Message) {
  if (message.type !== "ai" || !message.additional_kwargs) {
    return;
  }
  delete message.additional_kwargs.reasoning_content;
}

export function extractURLFromImageURLContent(
  content:
    | string
    | {
        url: string;
      },
) {
  if (typeof content === "string") {
    return content;
  }
  return content.url;
}

export function hasContent(message: Message) {
  // Use extractContentFromMessage so that content which is entirely
  // internal/tool-result noise (JSON blobs, middleware tags, etc.) is
  // correctly detected as empty. Otherwise messages whose raw content
  // is pure tool-result JSON would pass hasContent and be classified
  // as final-answer bubbles, leaking raw JSON into the UI.
  return extractContentFromMessage(message).length > 0;
}

export function hasReasoning(message: Message) {
  if (message.type !== "ai") {
    return false;
  }
  if (typeof message.additional_kwargs?.reasoning_content === "string") {
    return true;
  }
  if (Array.isArray(message.content)) {
    const part = message.content[0];
    // Compatible with the Anthropic gateway
    return (part as unknown as { type: "thinking" })?.type === "thinking";
  }
  if (typeof message.content === "string") {
    return splitInlineReasoning(message.content).reasoning !== null;
  }
  return false;
}

export function hasToolCalls(message: Message) {
  return (
    message.type === "ai" && message.tool_calls && message.tool_calls.length > 0
  );
}

export function hasPresentFiles(message: Message) {
  return (
    message.type === "ai" &&
    message.tool_calls?.some((toolCall) => toolCall.name === "present_files")
  );
}

export function isClarificationToolMessage(message: Message) {
  return message.type === "tool" && message.name === "ask_clarification";
}

export function extractPresentFilesFromMessage(message: Message) {
  if (message.type !== "ai" || !hasPresentFiles(message)) {
    return [];
  }
  const files: string[] = [];
  for (const toolCall of message.tool_calls ?? []) {
    if (
      toolCall.name === "present_files" &&
      Array.isArray(toolCall.args.filepaths)
    ) {
      files.push(...(toolCall.args.filepaths as string[]));
    }
  }
  return files;
}

export function hasSubagent(message: AIMessage) {
  for (const toolCall of message.tool_calls ?? []) {
    if (toolCall.name === "task") {
      return true;
    }
  }
  return false;
}

export function findToolCallResult(toolCallId: string, messages: Message[]) {
  for (const message of messages) {
    if (message.type === "tool" && message.tool_call_id === toolCallId) {
      const content = extractTextFromMessage(message);
      if (content) {
        return content;
      }
    }
  }
  return undefined;
}

const AGENT_ARTIFACT_HEADER_RE =
  /^(?:#\s*)?(?:SESSION\s+INTENT|SUMMARY|ARTIFACTS?)(?:[\s\n]|$)/i;
const INTERNAL_MESSAGE_NAMES = new Set([
  "summary",
  "loop_warning",
  "todo_reminder",
  "todo_completion_reminder",
  "memory_context",
  "token_economy_instruction",
  "view_image_details",
]);
const KNOWN_INTERNAL_REMINDER_NAMES = new Set([
  "todo_reminder",
  "todo_completion_reminder",
]);
const SYSTEM_REMINDER_RE = /^\s*<system[-_]reminder>[\s\S]*<\/system[-_]reminder>\s*$/i;

type MessageMetadataLike = Record<string, unknown> | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getMetadataCandidates(
  message: Message,
  metadata?: unknown,
): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = [];
  const messageMetadata = (message as Record<string, unknown>).metadata;
  if (isRecord(messageMetadata)) {
    candidates.push(messageMetadata);
  }
  if (isRecord(metadata)) {
    candidates.push(metadata);
    const streamMetadata = metadata.streamMetadata;
    if (isRecord(streamMetadata)) {
      candidates.push(streamMetadata);
    }
    const nestedMetadata = metadata.metadata;
    if (isRecord(nestedMetadata)) {
      candidates.push(nestedMetadata);
    }
  }
  return candidates;
}

function hasMiddlewareMetadata(metadata: Record<string, unknown>) {
  const caller = metadata.caller;
  if (typeof caller === "string" && caller.startsWith("middleware:")) {
    return true;
  }

  const tags = metadata.tags;
  if (
    Array.isArray(tags) &&
    tags.some((tag) => typeof tag === "string" && tag.startsWith("middleware:"))
  ) {
    return true;
  }

  return false;
}

export function isHiddenFromUIMessage(
  message: Message,
  metadata?: MessageMetadataLike,
) {
  if (
    message.additional_kwargs?.hide_from_ui === true ||
    typeof message.additional_kwargs?.internal_middleware_message === "string" ||
    (typeof message.name === "string" && INTERNAL_MESSAGE_NAMES.has(message.name))
  ) {
    return true;
  }
  // Filter out middleware messages from real-time stream
  if (
    getMetadataCandidates(message, metadata).some((candidate) =>
      hasMiddlewareMetadata(candidate),
    )
  ) {
    return true;
  }
  // Check for internal artifact headers (SESSION INTENT / SUMMARY / ARTIFACTS).
  // These are AI agent internal planning blocks that should never be shown to users.
  // We check the full extracted content AND individual content blocks (for array
  // content where the header might not be at the start of the joined text).
  if (message.type !== "tool" && !("tool_calls" in message && message.tool_calls?.length)) {
    const content = extractContentFromMessage(message);
    if (content && AGENT_ARTIFACT_HEADER_RE.test(content.trim())) {
      return true;
    }
    // Also check individual content blocks
    if (Array.isArray(message.content)) {
      for (const block of message.content as Array<{ type?: string; text?: string }>) {
        if (
          block.type === "text" &&
          typeof block.text === "string" &&
          AGENT_ARTIFACT_HEADER_RE.test(block.text.trim())
        ) {
          return true;
        }
      }
    }
  }
  if (
    message.type === "human" &&
    typeof message.name === "string" &&
    KNOWN_INTERNAL_REMINDER_NAMES.has(message.name)
  ) {
    const content = extractTextFromMessage(message);
    if (SYSTEM_REMINDER_RE.test(content)) {
      return true;
    }
  }
  return false;
}

/**
 * Strip internal planning blocks (SESSION INTENT, SUMMARY, ARTIFACTS)
 * from AI response content before displaying to the user.
 * Also masks sensitive values (API keys, tokens, passwords) in remaining text.
 *
 * Strategy:
 *   - First check: if the first non-blank line is an internal header, the
 *     ENTIRE text is internal planning content — return empty string.
 *     This handles the common case where SESSION INTENT + SUMMARY + details
 *     are the only content in the message.
 *   - Otherwise, remove internal blocks that appear AFTER user-facing content:
 *     enter skip mode on an internal header, and resume on a blank line when
 *     the next non-blank line is NOT another internal header.
 */
export function stripInternalContent(text: string): string {
  if (!text) return text;

  const lines = text.split("\n");

  // Fast path: if the first non-blank line is an internal header,
  // the entire text is internal planning content.
  const firstNonBlank = findNextNonBlankLine(lines, 0);
  if (
    firstNonBlank !== null &&
    AGENT_ARTIFACT_HEADER_RE.test(lines[firstNonBlank]!.trim())
  ) {
    return "";
  }

  // Slow path: internal blocks appear mid-text (rare but possible).
  const result: string[] = [];
  let skipping = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (AGENT_ARTIFACT_HEADER_RE.test(trimmed)) {
      skipping = true;
      continue;
    }

    if (skipping) {
      if (trimmed === "") {
        const nextNonBlank = findNextNonBlankLine(lines, i + 1);
        if (
          nextNonBlank !== null &&
          AGENT_ARTIFACT_HEADER_RE.test(lines[nextNonBlank]!.trim())
        ) {
          continue;
        }
        skipping = false;
      }
      continue;
    }

    result.push(line);
  }

  let output = result.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // Strip uploaded_files / current_uploads / working_directory tags injected
  // by middlewares so file listings and outline metadata never leak into the
  // prose body of the AI reply. They are surfaced separately via the file
  // cards and tool-activity chain.
  output = stripUploadedFilesTag(output);

  // Strip lines that begin with middleware/tool-status announcements that
  // the engine occasionally injects into the assistant content. These
  // are not part of the agent's own reply and must not leak into the
  // rendered message body.
  output = output.replace(
    /^[ \t]*Task Succeeded[.\s][^\n]*Result\s*:[^\n]*$/gim,
    "",
  );

  // Strip web_search / web_fetch / image_search tool result blobs that
  // the engine echoes back into the assistant content. These objects are
  // already rendered inside the tool-call card (ChainOfThought /
  // ToolCard), so showing them again in the prose is noise. We balance
  // braces line-by-line so nested arrays/objects are handled correctly.
  output = stripTopLevelJsonBlocks(output);

  // Mask sensitive values that might remain in the text
  output = output.replace(
    /\b([A-Z_]*(?:TOKEN|API_KEY|SECRET|PASSWORD|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL)[A-Z_]*)\s*[:=]\s*['"]?[0-9a-zA-Z_\-+/=]{8,}['"]?/gi,
    "$1=***masked***",
  );

  // Collapse blank lines that the strip above may have left behind.
  output = output.replace(/\n{3,}/g, "\n\n").trim();

  return output;
}

/**
 * Strip top-level JSON blocks whose first key is a known tool-result field.
 * Brace-balanced, line-by-line scan so nested arrays/objects are handled
 * correctly. Covers web_search results (query/results/total_results),
 * web_fetch payloads (url/title/content), and generic record sets.
 */
function stripTopLevelJsonBlocks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.trim();
    if (
      /^\{[\s]*"(?:query|results|records|total_results|title|url|content|source|answer)"\s*:/.test(
        trimmed,
      )
    ) {
      // Consume from line i forward, balancing braces.
      let depth = 0;
      let end = -1;
      for (let j = i; j < lines.length; j++) {
        for (const ch of lines[j]!) {
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              end = j;
              break;
            }
          }
        }
        if (end !== -1) break;
      }
      if (end === -1) {
        // Unbalanced — bail out so the remaining text isn't dropped.
        break;
      }
      i = end + 1;
      continue;
    }
    out.push(lines[i]!);
    i++;
  }
  return out.join("\n");
}

/** Find the index of the next non-blank line starting from `start`. */
function findNextNonBlankLine(lines: string[], start: number): number | null {
  for (let i = start; i < lines.length; i++) {
    if (lines[i]!.trim() !== "") return i;
  }
  return null;
}

/**
 * Represents a file stored in message additional_kwargs.files.
 * Used for optimistic UI (uploading state) and structured file metadata.
 */
export interface FileInMessage {
  filename: string;
  size: number; // bytes
  path?: string; // virtual path, may not be set during upload
  status?: "uploading" | "uploaded";
  /** Local Data/blob URL of the in-flight upload — instant thumbnail while the request is in progress. */
  localUrl?: string;
  /** IANA media type (e.g. image/png), available from the optimistic stage. */
  mediaType?: string;
}

/**
 * Strip injected middleware blocks from message content.
 * Removes <uploaded_files>, <working_directory> and <current_uploads>
 * tags so they don't appear in the chat UI (they are agent-internal
 * context injections — file list / outline / tool guidance that should
 * only surface in the upload file cards, never in the prose body).
 * Returns the cleaned content.
 */
export function stripUploadedFilesTag(content: string): string {
  return content
    .replace(/<uploaded_files>[\s\S]*?<\/uploaded_files>/g, "")
    .replace(/<working_directory>[\s\S]*?<\/working_directory>/g, "")
    .replace(/<current_uploads>[\s\S]*?<\/current_uploads>/g, "")
    .trim();
}

/**
 * Tag names that backend middlewares wrap around internal payloads before
 * letting them ride along inside LangGraph message ``content``. These markers
 * are *not* user copy and can leak through to the markdown renderer.
 *
 * Used by the streamdown preprocessing path (``core/streamdown/preprocess.ts``)
 * to strip leaked tag markers while preserving inner content. KWorks's
 * ``stripUploadedFilesTag`` handles the uploads-specific case separately.
 */
export const INTERNAL_MARKER_TAGS = [
  "current_uploads",
  "uploaded_files",
  "slash_skill_activation",
  "system-reminder",
  "memory",
  "current_date",
] as const;

export function parseUploadedFiles(content: string): FileInMessage[] {
  // Match <uploaded_files>...</uploaded_files> tag
  const uploadedFilesRegex = /<uploaded_files>([\s\S]*?)<\/uploaded_files>/;
  // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
  const match = content.match(uploadedFilesRegex);

  if (!match) {
    return [];
  }

  const uploadedFilesContent = match[1];

  // Check if it's "No files have been uploaded yet."
  if (uploadedFilesContent?.includes("No files have been uploaded yet.")) {
    return [];
  }

  // Check if the backend reported no new files were uploaded in this message
  if (uploadedFilesContent?.includes("(empty)")) {
    return [];
  }

  // Parse file list
  // Format: - filename (size)\n  Path: /path/to/file
  const fileRegex = /- ([^\n(]+)\s*\(([^)]+)\)\s*\n\s*Path:\s*([^\n]+)/g;
  const files: FileInMessage[] = [];
  let fileMatch;

  while ((fileMatch = fileRegex.exec(uploadedFilesContent ?? "")) !== null) {
    files.push({
      filename: fileMatch[1].trim(),
      size: parseInt(fileMatch[2].trim(), 10) ?? 0,
      path: fileMatch[3].trim(),
    });
  }

  return files;
}

/**
 * Detect a structured clarification request that the model emitted as
 * plain markdown (instead of routing through the ask_clarification tool
 * call) and convert it into a `HumanInputRequest` so the existing
 * `HumanInputCard` component can render the question + fields as an
 * interactive form rather than a wall of text.
 *
 * Recognised shape (simplified):
 *
 *   <optional question preamble — free prose>
 *
 *   1. **<field name> (required)** — options: A / B / C (multiple allowed)
 *   2. **<field name>** — options: D / E
 *   …
 *
 *   Please reply with a value for each field.
 *
 * If the closing marker is missing or no fields parse out, the helper
 * returns `null` so the caller falls back to the normal markdown render.
 */
export function tryExtractInlineHumanInputForm(
  content: string,
): HumanInputRequest | null {
  // Multi-lingual closing markers — assistants may phrase the ask in
  // English or Chinese, and any one of these appearing in the response
  // strongly signals an inline clarification the model wrote instead of
  // routing through the ask_clarification tool call.
  const markers = [
    "Please reply with a value for each field",
    "Please answer the following",
    "Please select",
    "Please confirm",
    "Please tell me",
    "请回答以下问题",
    "请回复",
    "请选择",
    "请确认",
    "请告诉我",
    "请逐一回答",
    "请提供以上信息",
  ];
  let markerIdx = -1;
  for (const m of markers) {
    const idx = content.indexOf(m);
    if (idx !== -1 && (markerIdx === -1 || idx < markerIdx)) {
      markerIdx = idx;
    }
  }

  const fieldPattern =
    // `\d+. <label> (required|optional) — options: a / b`
    // `**label**` bold is optional (assistants sometimes skip it).
    /(?:^|\n)\s*(\d+)\.\s+(?:\*\*)?([^*\n(]+?)(?:\*\*)?\s*\((required|可选|optional)\)\s*([^\n]*?)—\s*options?\s*:\s*([^\n]+)/gi;
  const indexedFields = new Map<number, HumanInputField>();
  const matches = [...content.matchAll(fieldPattern)];
  for (const match of matches) {
    const index = Number(match[1]);
    const rawLabel = (match[2] ?? "").trim();
    if (!rawLabel) continue;
    const cleanedLabel = rawLabel
      .replace(/\s*\(\s*(required|optional|可选)\s*\)\s*$/i, "")
      .trim();
    const required = /required|必填/i.test(rawLabel);
    const multiple = /multiple allowed/i.test(match[0]);
    const options = parseHumanInputOptions(match[5] ?? "");
    if (options.length === 0) continue;
    indexedFields.set(index, {
      name: cleanedLabel.replace(/\s+/g, "_").toLowerCase(),
      label: cleanedLabel,
      type: multiple ? "multi_select" : "select",
      required,
      options,
    });
  }

  // Capture `N. <label> (required)` lines without an `options:` clause —
  // those are free-text fields the model wants the user to type into.
  const textFieldPattern =
    /(?:^|\n)\s*(\d+)\.\s+(?:\*\*)?([^*\n(]+?)(?:\*\*)?\s*\((required|可选|optional)\)/gi;
  for (const match of content.matchAll(textFieldPattern)) {
    const index = Number(match[1]);
    if (indexedFields.has(index)) continue;
    const rawLabel = (match[2] ?? "").trim();
    if (!rawLabel) continue;
    const cleanedLabel = rawLabel
      .replace(/\s*\(\s*(required|optional|可选)\s*\)\s*$/i, "")
      .trim();
    const required = /required|必填/i.test(rawLabel);
    indexedFields.set(index, {
      name: cleanedLabel.replace(/\s+/g, "_").toLowerCase(),
      label: cleanedLabel,
      type: "textarea",
      required,
    });
  }

  // Preserve numeric ordering as emitted by the assistant.
  const fields: HumanInputField[] = [...indexedFields.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, field]) => field);

  if (fields.length === 0) return null;

  // If the model didn't emit a recognised closing marker but did list
  // at least two structured `(required)` / `(optional)` fields, treat
  // the block as an inline clarification anyway — better to render the
  // interactive card than a wall of prose.
  if (markerIdx === -1 && fields.length < 2) return null;

  // Question preamble is everything before the first numbered field, trimmed.
  const firstFieldMatch = content.match(/(?:^|\n)\s*1\.\s+/);
  const preambleEnd = firstFieldMatch
    ? content.indexOf(firstFieldMatch[0])
    : markerIdx === -1
      ? 0
      : markerIdx;
  const question = content
    .slice(0, preambleEnd === -1 ? markerIdx : preambleEnd)
    .trim();

  return {
    version: 1,
    kind: "human_input_request",
    source: "inline-form",
    request_id: `inline-${Date.now().toString(36)}`,
    question:
      question.length > 0 ? question : "请回答以下问题：",
    input_mode: "form",
    fields,
  };
}

/**
 * Parse a free-form `options:` segment into structured
 * {@link HumanInputOption} entries. Tolerates ` / `, `、`, and `, ` as
 * separators and strips trailing parenthesis hints such as
 * `(multiple allowed)`.
 */
function parseHumanInputOptions(text: string): HumanInputOption[] {
  const cleaned = text.replace(/\([^)]*\)\s*$/g, "").trim();
  const parts = cleaned
    .split(/\s*[、,\/]\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.map((label, idx) => ({
    id: `${idx}-${label.slice(0, 16)}`,
    label,
    value: label,
  }));
}
