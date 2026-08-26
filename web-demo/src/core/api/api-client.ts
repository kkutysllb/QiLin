"use client";

import { Client as LangGraphClient } from "@langchain/langgraph-sdk/client";

import { getDesktopSessionToken } from "../auth/session";
import { getLangGraphBaseURL, isDesktop } from "../config";

import { isStateChangingMethod, readCsrfCookie } from "./fetcher";
import { sanitizeRunStreamOptions } from "./stream-mode";

/**
 * SDK ``onRequest`` hook that mints the ``X-CSRF-Token`` header from the
 * live ``csrf_token`` cookie just before each outbound fetch.
 *
 * Reading the cookie per-request (rather than baking it into the SDK's
 * ``defaultHeaders`` at construction) handles login / logout / password
 * change cookie rotation transparently. Both the ``/api/langgraph/*`` SDK
 * path and the direct REST endpoints in ``fetcher.ts:fetchWithAuth``
 * share :func:`readCsrfCookie` and :const:`STATE_CHANGING_METHODS` so
 * the contract stays in lockstep.
 */
function injectCsrfHeader(_url: URL, init: RequestInit): RequestInit {
  if (!isStateChangingMethod(init.method ?? "GET")) {
    return init;
  }
  const token = readCsrfCookie();
  if (!token) return init;
  const headers = new Headers(init.headers);
  if (!headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", token);
  }
  return { ...init, headers };
}

function injectDesktopAuthorization(init: RequestInit): RequestInit {
  // Inject the desktop session token in BOTH dev and managed desktop modes.
  // Dev mode: the LangGraph SDK connects directly to the gateway
  // (localhost:<gatewayPort>) bypassing the Next.js rewrite proxy so SSE
  // streams flush token-by-token. This cross-port fetch is same-site but
  // SameSite cookies proved unreliable in Electron across ports — the
  // access_token + csrf_token cookies set via the same-origin proxy at login
  // are not reliably carried on the direct cross-port call, so the Bearer
  // token (persisted to localStorage by the login page from the gateway's
  // access_token response field) is the reliable auth signal. The gateway's
  // CSRF middleware exempts Bearer requests, so streaming POSTs pass.
  // Managed mode: renderer is app:// (cross-scheme), no cookies available,
  // Bearer is the sole auth signal.
  if (!isDesktop()) return init;

  const token = getDesktopSessionToken();
  if (!token) {
    return init;
  }

  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return { ...init, headers };
}

export function prepareLangGraphRequest(url: URL, init: RequestInit): RequestInit {
  return injectDesktopAuthorization(injectCsrfHeader(url, init));
}

// ---------------------------------------------------------------------------
// Reconnect / cancel error helpers (additive — ported from upstream deer-flow).
//
// These are pure predicates and an error class. They do NOT rewire the SDK's
// stream/cancel/joinStream methods here (that upstream rewiring depends on the
// static-mode client and the full stream-replay-gap recovery loop, which are
// not being adopted in this resync). They are imported by other modules to
// classify gateway 409s when deciding whether a reconnect/cancel is a no-op.
// ---------------------------------------------------------------------------

export type StreamReplayGapData = {
  code: "stream_replay_gap";
  run_id: string;
  requested_event_id: string | null;
  earliest_available_event_id: string;
  latest_available_event_id: string;
  recovery: "reload_durable_state";
};

export class StreamReplayGapError extends Error {
  constructor(
    readonly gap: StreamReplayGapData,
    readonly recoveryAttempts: number,
    readonly recoveryCause?: unknown,
  ) {
    super(
      `Unable to recover SSE history after ${recoveryAttempts} attempts (requested ${gap.requested_event_id ?? "initial stream"}, earliest ${gap.earliest_available_event_id})`,
    );
    this.name = "StreamReplayGapError";
  }
}

/**
 * Shared matcher for the gateway's 409 conflict responses. The SDK surfaces
 * non-2xx responses as ``HTTPError { status, message }`` where ``message`` is
 * ``"HTTP 409: {\"detail\":\"...\"}"``, so a 409 may be detected either via the
 * numeric ``status`` or a substring of ``message``. Every passed ``needles``
 * substring must be present (AND semantics).
 */
function isRunConflictError(error: unknown, ...needles: string[]): boolean {
  const status =
    typeof error === "object" && error !== null
      ? Reflect.get(error, "status")
      : undefined;
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null
          ? String(Reflect.get(error, "message") ?? "")
          : "";

  return (
    (status === 409 || message.includes("HTTP 409")) &&
    needles.every((needle) => message.includes(needle))
  );
}

// Store-only run cannot be streamed (no in-memory stream bridge on this
// worker): reconnect has nothing to rejoin.
export function isInactiveRunStreamError(error: unknown): boolean {
  return isRunConflictError(
    error,
    "not active on this worker",
    "cannot be streamed",
  );
}

/**
 * Matches the gateway's terminal-state cancel conflict, raised as
 * ``Run X is not cancellable (status: success|error|timeout)`` when
 * ``RunManager.cancel`` refuses a run that already finished. The sibling
 * "not active on this worker and cannot be cancelled" branch (run still live on
 * another worker) is intentionally NOT matched.
 */
export function isRunNotCancellableError(error: unknown): boolean {
  return isRunConflictError(error, "is not cancellable");
}

/**
 * Forget the remembered reconnect run id for ``threadId`` so a subsequent
 * reconnect does not target a finished/cancelled run. No-op when the stored id
 * differs (a newer run owns the key). Exported under both names for callers
 * keyed to upstream's API.
 */
export function clearReconnectRun(
  threadId: string | null | undefined,
  runId: string,
): void {
  if (typeof window === "undefined" || !threadId) return;

  const key = `lg:stream:${threadId}`;
  try {
    const storage = window.sessionStorage;
    if (storage.getItem(key) === runId) {
      storage.removeItem(key);
    }
  } catch {
    // Ignore storage access failures so reconnect cleanup never throws.
  }
}

export const clearReconnect = clearReconnectRun;

function createCompatibleClient(isMock?: boolean): LangGraphClient {
  const apiUrl = getLangGraphBaseURL(isMock);
  const client = new LangGraphClient({
    apiUrl,
    onRequest: prepareLangGraphRequest,
  });

  const originalRunStream = client.runs.stream.bind(client.runs);
  client.runs.stream = ((threadId, assistantId, payload) =>
    originalRunStream(
      threadId,
      assistantId,
      sanitizeRunStreamOptions(payload),
    )) as typeof client.runs.stream;

  const originalJoinStream = client.runs.joinStream.bind(client.runs);
  client.runs.joinStream = ((threadId, runId, options) =>
    originalJoinStream(
      threadId,
      runId,
      sanitizeRunStreamOptions(options),
    )) as typeof client.runs.joinStream;

  return client;
}

const _clients = new Map<string, LangGraphClient>();
export function getAPIClient(isMock?: boolean): LangGraphClient {
  const cacheKey = isMock ? "mock" : "default";
  let client = _clients.get(cacheKey);

  if (!client) {
    client = createCompatibleClient(isMock);
    _clients.set(cacheKey, client);
  }

  return client;
}
