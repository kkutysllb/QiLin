/**
 * 把线程摘要列表与 /api/workspaces/tree 投影组装成树推导层的输入。
 *
 * 纯函数、零 React；标题与时间戳的换算规则收敛在这里，
 * 保持「数据源字段 → 推导层词汇」只有一个换算点。
 */
import type {
  ThreadListSnapshot,
  ThreadSummary,
  WorkspaceGroupInput,
} from "@/lib/workspace-tree";

import type { WorkspaceTreeResponse } from "./types";

/** 组装器可接收的最小线程形状（AgentThread 的只读投影）。 */
export interface ThreadLike {
  thread_id: string;
  /** 展示标题（组件层用 titleOfThread 预处理后传入）。 */
  title: string;
  updated_at: string | number;
}

export interface SidebarInputs {
  list: ThreadListSnapshot;
  groups: WorkspaceGroupInput[];
  /** false 表示树投影尚未装载——此时不做任何归属判断，派生结果保持稳定。 */
  reachedBackend: boolean;
}

function toEpochMs(value: string | number): number {
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * @param threads 线程摘要（调用方已把标题预处理成展示文案）。
 * @param tree 树投影；undefined 时全部线程落入 Ungrouped 回退桶。
 */
export function buildSidebarInputs(
  threads: readonly ThreadLike[],
  tree: WorkspaceTreeResponse | undefined,
): SidebarInputs {
  const ids: string[] = [];
  const byId: Record<string, ThreadSummary> = {};
  const seen = new Set<string>();
  for (const thread of threads) {
    // 后端分页可能返回重复行；快照索引按首次出现去重。
    if (seen.has(thread.thread_id)) continue;
    seen.add(thread.thread_id);
    ids.push(thread.thread_id);
    byId[thread.thread_id] = {
      id: thread.thread_id,
      title: thread.title,
      updatedAt: toEpochMs(thread.updated_at),
    };
  }
  const list: ThreadListSnapshot = { ids, byId };

  const groups: WorkspaceGroupInput[] =
    tree?.workspaces.map((node) => ({
      id: node.id,
      canonicalPath: node.path,
      title: node.title,
      createdAt: node.created_at,
      threadIds: node.thread_ids,
    })) ?? [];

  return {
    list,
    groups,
    reachedBackend: tree !== undefined,
  };
}

/**
 * 该线程当前归属的工作区组。返回 undefined = 属于 Ungrouped（仅当
 * 后端投影已到达才成立，避免查询未装载时误显示迁移动作）。
 */
export function owningWorkspace(
  inputs: SidebarInputs,
  threadId: string,
): WorkspaceGroupInput | undefined {
  return inputs.groups.find((g) => g.threadIds.includes(threadId));
}
