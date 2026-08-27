"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SidebarTabState } from "./protocol";

async function fetchTabs(threadId: string): Promise<SidebarTabState> {
  const res = await fetch(`/api/threads/${threadId}/sidebar-tabs`, { credentials: "include" });
  if (res.status === 404) return { tabs: [], active: null, split: "single" };
  if (!res.ok) throw new Error(`tabs fetch failed: ${res.status}`);
  return (await res.json()) as SidebarTabState;
}

async function putTabs(threadId: string, state: SidebarTabState): Promise<SidebarTabState> {
  const res = await fetch(`/api/threads/${threadId}/sidebar-tabs`, {
    method: "PUT", credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`tabs save failed: ${res.status}`);
  return (await res.json()) as SidebarTabState;
}

export function useSidebarTabs(threadId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["sidebar-tabs", threadId],
    queryFn: () => fetchTabs(threadId),
    enabled: !!threadId,
    staleTime: 5_000,
  });
  const mutation = useMutation({
    mutationFn: (next: SidebarTabState) => putTabs(threadId, next),
    onSuccess: (next) => qc.setQueryData(["sidebar-tabs", threadId], next),
  });
  return { ...query, save: mutation.mutateAsync };
}
