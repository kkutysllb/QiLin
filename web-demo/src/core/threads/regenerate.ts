import type { Message } from "@langchain/langgraph-sdk";

import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";
import { isHiddenFromUIMessage } from "@/core/messages/utils";

/**
 * Regenerate / edit-resubmit support.
 *
 * Preferred path: the gateway's checkpoint-replay endpoints
 * (`POST /api/threads/{id}/runs/regenerate/prepare` and `…/edit-regenerate/prepare`)
 * roll the thread back to the checkpoint before the target user turn and
 * return the run input + checkpoint to submit — restoring titles, handling
 * interrupted runs, and validating turn ordering server-side.
 *
 * Fallback path (older backend / prepare failure): rewrite history through
 * one run input, relying on `add_messages` reducer semantics the backend
 * already implements:
 *   - Removals ride as `{ role: "remove", id, content: "" }` entries, which
 *     coerce to `RemoveMessage` and delete the matching message by id.
 *   - A human message re-submitted with the SAME id replaces the original
 *     in place (content updated, everything else preserved).
 */

/** Response of the gateway's `runs/regenerate/prepare` (and edit variant). */
export interface RegeneratePrepareResult {
  input: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  metadata: Record<string, unknown>;
  target_run_id: string;
}

function threadRunsUrl(threadId: string, action: string): string {
  return `${getBackendBaseURL()}/api/threads/${encodeURIComponent(
    threadId,
  )}/runs/${action}/prepare`;
}

async function postPrepare(
  url: string,
  body: Record<string, string>,
): Promise<RegeneratePrepareResult | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as RegeneratePrepareResult;
    if (
      !payload ||
      typeof payload.input !== "object" ||
      typeof payload.checkpoint !== "object"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Ask the gateway to prepare a checkpoint-replay regenerate for the given
 * assistant message. Returns `null` when the endpoint is unavailable or
 * rejects the request (callers then fall back to the removal-based path).
 */
export function prepareRegenerate(
  threadId: string,
  messageId: string,
): Promise<RegeneratePrepareResult | null> {
  return postPrepare(threadRunsUrl(threadId, "regenerate"), { message_id: messageId });
}

/**
 * Ask the gateway to prepare an edit-and-rerun of the given human message.
 * Returns `null` when the endpoint is unavailable or rejects the request.
 */
export function prepareEditRegenerate(
  threadId: string,
  humanMessageId: string,
  replacementText: string,
): Promise<RegeneratePrepareResult | null> {
  return postPrepare(threadRunsUrl(threadId, "edit-regenerate"), {
    human_message_id: humanMessageId,
    replacement_text: replacementText,
  });
}

/** The dict form that coerces to RemoveMessage on both reducer paths. */
function removeMessage(id: string): Message {
  return { role: "remove", id, content: "" } as unknown as Message;
}

function removableIds(messages: Message[], fromIndex: number): string[] {
  const ids: string[] = [];
  for (let index = fromIndex; index < messages.length; index++) {
    const id = messages[index]?.id;
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Build the input messages that drop every message after the LAST visible
 * human message, so the model regenerates its answer to that prompt.
 * Returns `null` when there is nothing to regenerate (no visible human
 * anchor, or nothing after it).
 */
export function buildRegenerateMessages(
  messages: Message[],
): Message[] | null {
  let anchorIndex = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.type === "human" && !isHiddenFromUIMessage(message)) {
      anchorIndex = index;
      break;
    }
  }
  if (anchorIndex === -1 || anchorIndex === messages.length - 1) {
    return null;
  }
  const removals = removableIds(messages, anchorIndex + 1);
  if (removals.length === 0) {
    return null;
  }
  return removals.map((id) => removeMessage(id));
}

/**
 * Build the input messages that re-submit an edited human message: every
 * message after it is removed and the human message itself is replaced
 * (same id, new content) so the model answers the edited prompt.
 * Returns `null` when the target message cannot be found.
 */
export function buildEditResubmitMessages(
  messages: Message[],
  messageId: string,
  replacementText: string,
): Message[] | null {
  const trimmed = replacementText.trim();
  if (!trimmed) return null;
  const targetIndex = messages.findIndex(
    (message) => message.id === messageId && message.type === "human",
  );
  if (targetIndex === -1) return null;

  const removals = removableIds(messages, targetIndex + 1).map((id) =>
    removeMessage(id),
  );
  const target = messages[targetIndex]!;
  const updated: Message = {
    ...target,
    content: trimmed,
  };
  return [...removals, updated];
}
