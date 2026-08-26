import { getBackendBaseURL } from "../config";

import { fetch } from "./fetcher";

export interface InjectParams {
  content: string;
  attachments?: unknown[];
  messageId: string;
  queuedAt: number;
}

export interface InjectResponse {
  run_id: string;
  message_id: string;
  status: "accepted";
  note: string;
}

/**
 * Error from POST /inject.
 *
 * ``code`` is populated only for the 409 ``run_not_active`` case, where the
 * backend returns ``{"detail": {"code": "run_not_active", ...}}``. Other
 * failures (404 / 422 / 5xx) return ``{"detail": "string"}`` and leave
 * ``code`` undefined. Callers (Task 8 coordinator) branch on
 * ``e.code === "run_not_active"`` to decide whether to downgrade the queue
 * item back to pending instead of marking it errored.
 */
export class InjectError extends Error {
  constructor(
    public code: string | undefined,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "InjectError";
  }
}

/**
 * Inject a supplement-context message into a running agent mid-run.
 *
 * POST /api/threads/{thread_id}/runs/{run_id}/inject writes the message to
 * ``ThreadState.pending_messages`` without interrupting the worker; the
 * agent's ``before_model`` hook (InjectMiddleware) consumes it at the next
 * model call. Returns 202 ``accepted`` on success.
 *
 * Uses the shared :func:`fetch` wrapper so CSRF, desktop Bearer auth, and
 * ``credentials: "include"`` are handled centrally (same as feedback.ts).
 */
export async function injectMessage(
  threadId: string,
  runId: string,
  params: InjectParams,
): Promise<InjectResponse> {
  const res = await fetch(
    `${getBackendBaseURL()}/api/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/inject`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: params.content,
        attachments: params.attachments ?? null,
        message_id: params.messageId,
        queued_at: params.queuedAt,
      }),
    },
  );
  if (!res.ok) {
    let code: string | undefined;
    let detail: string;
    try {
      const body = await res.json();
      // Backend returns {detail: {code, message, run_status}} for 409, or
      // {detail: "string"} for 404/422/5xx. Handle BOTH shapes.
      const d = body.detail;
      if (typeof d === "object" && d !== null) {
        code = d.code;
        detail = d.message ?? JSON.stringify(d);
      } else {
        detail = typeof d === "string" ? d : res.statusText;
      }
    } catch {
      detail = res.statusText;
    }
    throw new InjectError(code, detail, res.status);
  }
  return res.json();
}
