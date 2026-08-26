import { fetch } from "@/core/api/fetcher";
import { getBackendBaseURL } from "@/core/config";

/**
 * Workspace change audit — frontend mirror of the gateway's
 * `GET /api/threads/{id}/runs/{run_id}/workspace-changes` endpoint
 * (qilin workspace_changes recorder). The payload describes every file the
 * agent created / modified / deleted during one run, with optional diffs.
 */

export interface WorkspaceFileChange {
  path: string;
  root: string;
  status: "created" | "modified" | "deleted" | string;
  binary: boolean;
  sensitive: boolean;
  size_before: number | null;
  size_after: number | null;
  diff: string;
  diff_truncated: boolean;
  diff_unavailable_reason: string | null;
  additions: number;
  deletions: number;
  symlink: boolean;
  symlink_target_before: string | null;
  symlink_target_after: string | null;
}

export interface WorkspaceChangeSummary {
  created: number;
  modified: number;
  deleted: number;
  symlink_created: number;
  additions: number;
  deletions: number;
  truncated: boolean;
}

export interface WorkspaceChangesResponse {
  available: boolean;
  version: number;
  summary: WorkspaceChangeSummary;
  files: WorkspaceFileChange[];
  limits: Record<string, unknown>;
}

export interface RunSummary {
  run_id: string;
  status: string;
  created_at: string;
}

/**
 * Fetch the workspace-change audit for a thread's most recent run:
 * lists the thread's runs, picks the latest one that has a recorded
 * result (success first, any terminal run as fallback), then pulls its
 * change report. Returns `null` when no run / no recorder data exists.
 */
export async function fetchLatestWorkspaceChanges(
  threadId: string,
): Promise<WorkspaceChangesResponse | null> {
  const base = `${getBackendBaseURL()}/api/threads/${encodeURIComponent(threadId)}`;
  const runsResponse = await fetch(`${base}/runs`, { cache: "no-store" });
  if (!runsResponse.ok) return null;
  const runs = (await runsResponse.json().catch(() => null)) as
    | RunSummary[]
    | null;
  if (!Array.isArray(runs) || runs.length === 0) return null;

  const byRecency = [...runs].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
  const preferred =
    byRecency.find((run) => run.status === "success") ?? byRecency[0];
  if (!preferred) return null;

  const changesResponse = await fetch(
    `${base}/runs/${encodeURIComponent(preferred.run_id)}/workspace-changes`,
    { cache: "no-store" },
  );
  if (!changesResponse.ok) return null;
  const payload = (await changesResponse.json().catch(() => null)) as
    | WorkspaceChangesResponse
    | null;
  if (payload?.available !== true) return null;
  return payload;
}
