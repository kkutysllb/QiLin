import type { Message } from "@langchain/langgraph-sdk";

import { stripUploadedFilesTag } from "@/core/messages/utils";

import type { AgentThread, AgentThreadContext } from "./types";

type ThreadRouteTarget =
  | string
  | {
      thread_id: string;
      context?: Pick<AgentThreadContext, "agent_name"> | null;
      metadata?: Record<string, unknown> | null;
    };

/**
 * Extract the thread_id / agent_name segments from a workspace chat URL.
 *
 * Supports both ``/workspace/chats/{thread_id}`` and
 * ``/workspace/agents/{agent_name}/chats/{thread_id}`` routes.
 *
 * In the Electron desktop build (``output: "export"``), only
 * ``/workspace/chats/new`` is pre-rendered. All other thread IDs are served
 * the same ``new.html`` file by the Electron protocol handler. Next.js
 * hydrates that file with the RSC payload baked into ``new.html`` — which
 * hard-codes ``params.thread_id = "new"``. As a result ``useParams()``
 * returns the stale value "new" even when the browser URL is
 * ``/workspace/chats/{real-uuid}``, causing every history thread to render
 * as a blank new conversation.
 *
 * Parsing the IDs from ``usePathname()`` (which reflects the real browser
 * URL) instead of ``useParams()`` sidesteps the stale RSC payload and
 * correctly identifies the requested thread. The agent-name regex tolerates
 * percent-encoded names (e.g. ``/workspace/agents/my%20agent/chats/{id}``).
 */
export function parseThreadIdFromPath(pathname: string | null): string {
  if (!pathname) return "new";
  // Match the last segment after /chats/ in either route shape.
  const match = /\/chats\/([^/?#]+)/.exec(pathname);
  const raw = match?.[1];
  if (!raw) return "new";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function parseAgentNameFromPath(
  pathname: string | null,
): string | undefined {
  if (!pathname) return undefined;
  const match = /\/workspace\/agents\/([^/]+)\//.exec(pathname);
  const raw = match?.[1];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function pathOfThread(
  thread: ThreadRouteTarget,
  context?: Pick<AgentThreadContext, "agent_name"> | null,
) {
  const threadId = typeof thread === "string" ? thread : thread.thread_id;
  let agentName: string | undefined;
  if (typeof thread === "string") {
    agentName = context?.agent_name;
  } else {
    agentName = thread.context?.agent_name;
    if (!agentName) {
      const metaAgent = thread.metadata?.agent_name;
      if (typeof metaAgent === "string") {
        agentName = metaAgent;
      }
    }
  }

  return agentName
    ? `/workspace/agents/${encodeURIComponent(agentName)}/chats/${threadId}`
    : `/workspace/chats/${threadId}`;
}

export function textOfMessage(message: Message) {
  if (typeof message.content === "string") {
    return message.content;
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "text") {
        return part.text;
      }
    }
  }
  return null;
}

export function titleOfThread(thread: AgentThread) {
  const title = thread.values?.title;
  if (!title) return "Untitled";
  // Strip leaked middleware tags (uploaded files listing / working dir)
  // that the auto-naming may have picked up as the title prefix.
  const cleaned = stripUploadedFilesTag(title);
  return cleaned || "Untitled";
}
