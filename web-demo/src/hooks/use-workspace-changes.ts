"use client";

import { useQuery } from "@tanstack/react-query";

import {
  fetchLatestWorkspaceChanges,
  type WorkspaceChangesResponse,
} from "@/core/threads/workspace-changes";

/**
 * Workspace-change audit for the active thread. `turnSignal` should change
 * once per completed turn (e.g. the visible human-message count) so the
 * audit refetches when the agent finishes work, without polling during
 * streaming.
 */
export function useWorkspaceChanges(
  threadId: string | null,
  turnSignal: number,
  enabled = true,
) {
  return useQuery<WorkspaceChangesResponse | null>({
    queryKey: ["workspace-changes", threadId, turnSignal],
    enabled: enabled && threadId !== null,
    staleTime: 30_000,
    retry: false,
    queryFn: () => fetchLatestWorkspaceChanges(threadId!),
  });
}
