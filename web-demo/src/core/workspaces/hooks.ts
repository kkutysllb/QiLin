"use client";
/**
 * 工作区注册表的 TanStack Query 接入。
 *
 * 读侧只有树投影一个 query（侧栏唯一数据源）；写侧九个动词 mutation
 * 全部以 ``["workspaces"]`` 前缀失效——注册表是唯一权威，本地不做
 * 乐观合并（手动排序的乐观更新由组件层用本地序实现，见 P3c）。
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "./api";

export type { WorkspaceApiError } from "./api";

const WORKSPACES_KEY = ["workspaces"] as const;

/** 侧栏树投影：workspaces / ungrouped_thread_ids / archived_thread_ids。 */
export function useWorkspaceTree() {
  return useQuery({
    queryKey: [...WORKSPACES_KEY, "tree"],
    queryFn: () => api.getWorkspaceTree(),
    staleTime: 5_000,
  });
}

function useInvalidatingMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: WORKSPACES_KEY });
    },
  });
}

export function useCreateWorkspace() {
  return useInvalidatingMutation(
    (input: { path: string; title?: string }) =>
      api.createWorkspace(input.path, input.title),
  );
}

/** 宿主原生目录选择器（DSH host.pickDirectory 对齐）；取消返回 null。 */
export function usePickDirectory() {
  return useMutation({ mutationFn: () => api.pickDirectory() });
}

export function useRenameWorkspace() {
  return useInvalidatingMutation((input: { workspaceId: string; title: string }) =>
    api.renameWorkspace(input.workspaceId, input.title),
  );
}

export function useReorderWorkspace() {
  return useInvalidatingMutation((input: { workspaceId: string; beforeId: string | null }) =>
    api.reorderWorkspace(input.workspaceId, input.beforeId),
  );
}

export function useDeleteWorkspace() {
  return useInvalidatingMutation((workspaceId: string) =>
    api.deleteWorkspace(workspaceId),
  );
}

export function useAttachThread() {
  return useInvalidatingMutation((input: { workspaceId: string; threadId: string }) =>
    api.attachThread(input.workspaceId, input.threadId),
  );
}

export function useDetachThread() {
  return useInvalidatingMutation((input: { workspaceId: string; threadId: string }) =>
    api.detachThread(input.workspaceId, input.threadId),
  );
}

export function useReorderThread() {
  return useInvalidatingMutation((input: {
    workspaceId: string;
    threadId: string;
    beforeThreadId: string | null;
  }) => api.reorderThread(input.workspaceId, input.threadId, input.beforeThreadId));
}

export function useArchiveThreads() {
  return useInvalidatingMutation((threadIds: string[]) =>
    api.archiveThreads(threadIds),
  );
}

export function useUnarchiveThreads() {
  return useInvalidatingMutation((threadIds: string[]) =>
    api.unarchiveThreads(threadIds),
  );
}
