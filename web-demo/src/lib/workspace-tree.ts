/**
 * 工作区分组树的同构纯函数推导层 —— 对齐 DSH
 * packages/client/ui-workspace/src/client/tree.ts 的语义（移植时按计划去掉了
 * subagent 血缘折叠与 provisional 空会话两个 QiLin 不具备的概念）。
 *
 * 输入词汇直接对接 GET /api/workspaces/tree 的投影：
 * - `workspaces[]` 行 → WorkspaceGroupInput（threadIds 为注册表账户序）；
 * - 会话侧由调用方把线程摘要折叠成 ids + byId 的快照索引；
 * - 归档集合、Ungrouped 补充顺序是浏览器本地状态。
 *
 * 这里不做任何 IO / 订阅（数据访问梯子：派生数据是纯函数），排序权威规则：
 * 工作区内按注册表账户序（活动永不自动重排）；Ungrouped 未初始化本地序时
 * 按最近更新回退；时间相等的行以 id 字典序做确定性平局裁决。
 */

/** Ungrouped 桶的分组键。 */
export const UNGROUPED_KEY = "";

/** Ungrouped 桶的展示名。 */
export const UNGROUPED_LABEL = "Ungrouped";

/** 参与树推导的最小线程摘要。 */
export interface ThreadSummary {
  id: string;
  /** 存储的展示标题（空标题由渲染层替换为「新会话」类本地化文案）。 */
  title: string;
  /** 最近活动时刻（epoch ms）。 */
  updatedAt: number;
}

/** 线程列表快照：渲染序 ids 与 id 索引分离，成员缺失需容忍（分页追赶）。 */
export interface ThreadListSnapshot {
  ids: readonly string[];
  byId: Readonly<Record<string, ThreadSummary>>;
}

/** 一个工作区分组的输入投影（/api/workspaces/tree 的 workspaces 行）。 */
export interface WorkspaceGroupInput {
  /** 注册表实体 id（uuid）——不是路径。 */
  id: string;
  canonicalPath: string;
  title: string;
  /** ISO 字符串或 epoch ms。 */
  createdAt: number | string;
  /** 账户内的线程 id，手动拥有的展示序。 */
  threadIds: readonly string[];
}

/** 树推导的本地视图状态。 */
export interface TreeView {
  expandedGroups?: readonly string[];
  /** Ungrouped 的浏览器本地理：未提供或未覆盖的 loose 行回退到最近更新。 */
  ungroupedOrder?: readonly string[];
}

/** 一条顶层会话行。 */
export interface SessionNode {
  id: string;
  title: string;
  updatedAt: number;
}

/** 一个工作区分组节（含折叠后的可见行）。 */
export interface GroupNode {
  /** 分组键：工作区 id 或 {@link UNGROUPED_KEY}。 */
  key: string;
  /** 背后的工作区 id；仅 Ungrouped 桶缺省。 */
  workspaceId: string | undefined;
  cwd: string | undefined;
  /** epoch ms；仅 Ungrouped 桶缺省。 */
  createdAt: number | undefined;
  label: string;
  /** 该组可见会话总数（折叠时仍计入）。 */
  sessionCount: number;
  expanded: boolean;
  /** 该组包含当前选中的会话（活动着色由渲染层用）。 */
  containsCurrent: boolean;
  /** 可见会话行（折叠时为空数组）。 */
  sessions: readonly SessionNode[];
}

/**
 * 目录展示标签：取路径 basename（两种分隔符都认），作为无标题工作区与
 * Ungrouped 桶的兜底。
 * @param cwd 目录路径；undefined 或空串返回 Ungrouped 标签。
 * @returns basename；无 basename 时原样返回路径。
 */
export function workspaceLabel(cwd: string | undefined): string {
  if (cwd === undefined || cwd === "") return UNGROUPED_LABEL;
  const base = cwd.replace(/[/\\]+$/, "").split(/[/\\]/).pop();
  return base !== undefined && base !== "" ? base : cwd;
}

/** 最近更新比较器：新者在前，id 作确定性平局裁决。 */
export function byRecency(a: ThreadSummary, b: ThreadSummary): number {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
  return a.id < b.id ? -1 : 1;
}

function toEpochMs(value: number | string): number {
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

interface Bucket {
  key: string;
  workspaceId: string | undefined;
  cwd: string | undefined;
  createdAt: number | undefined;
  label: string;
  members: ThreadSummary[];
}

/** 应用已存的 Ungrouped 本地序；新出现的 loose 行按最近更新追加在尾部。 */
function orderedUngrouped(
  members: readonly ThreadSummary[],
  stored: readonly string[],
): ThreadSummary[] {
  const byId = new Map(members.map((s) => [s.id, s]));
  const included = new Set<string>();
  const ordered: ThreadSummary[] = [];
  for (const key of stored) {
    const summary = byId.get(key);
    // 已被重复表项占位的 id 同样跳过——保持单调不重复。
    if (summary === undefined || included.has(key)) continue;
    ordered.push(summary);
    included.add(key);
  }
  for (const summary of [...members].sort(byRecency)) {
    if (included.has(summary.id)) continue;
    ordered.push(summary);
  }
  return ordered;
}

function groupByWorkspace(
  list: ThreadListSnapshot,
  workspaces: readonly WorkspaceGroupInput[],
  archived: ReadonlySet<string>,
  ungroupedOrder: readonly string[] | undefined,
): Bucket[] {
  const buckets: Bucket[] = [];
  const accounted = new Set<string>();
  for (const workspace of workspaces) {
    const members: ThreadSummary[] = [];
    for (const id of workspace.threadIds) {
      const summary = list.byId[id];
      // 摘要可能落后于账户拉取；缺失行等它落库后自然出现。
      if (summary === undefined) continue;
      accounted.add(id);
      if (archived.has(id)) continue;
      members.push(summary);
    }
    buckets.push({
      key: workspace.id,
      workspaceId: workspace.id,
      cwd: workspace.canonicalPath,
      createdAt: toEpochMs(workspace.createdAt),
      label: workspace.title !== "" ? workspace.title : workspaceLabel(workspace.canonicalPath),
      members,
    });
  }
  const stray = list.ids
    .map((id) => list.byId[id])
    .filter((s): s is ThreadSummary => s !== undefined && !accounted.has(s.id) && !archived.has(s.id));
  if (stray.length > 0) {
    buckets.push({
      key: UNGROUPED_KEY,
      workspaceId: undefined,
      cwd: undefined,
      createdAt: undefined,
      label: UNGROUPED_LABEL,
      members:
        ungroupedOrder === undefined ? [...stray].sort(byRecency) : orderedUngrouped(stray, ungroupedOrder),
    });
  }
  return buckets;
}

/**
 * 推导工作区分组树（每组会话都是顶层行）。
 *
 * 所有组都出现；会话行只在所属组展开时投影。归档会话在任何视图下都不出现，
 * 全部归档后其所在组仍然保留（空组展示）。当前会话只决定 containsCurrent。
 * @param list 线程列表快照（ids + byId）。
 * @param workspaces 注册表持久序的工作区行。
 * @param archivedThreadIds 注册表全局归档集。
 * @param view 展开记忆与 Ungrouped 本地序。
 * @param currentThreadId 当前选中会话（可选）。
 * @returns 渲染序的分组节。
 */
export function deriveGroups(
  list: ThreadListSnapshot,
  workspaces: readonly WorkspaceGroupInput[],
  archivedThreadIds: readonly string[],
  view: TreeView,
  currentThreadId?: string,
): GroupNode[] {
  const archived = new Set(archivedThreadIds);
  const expandedGroups = new Set(view.expandedGroups ?? []);
  const currentGroup =
    currentThreadId === undefined
      ? undefined
      : (workspaces.find((w) => w.threadIds.includes(currentThreadId))?.id ?? UNGROUPED_KEY);
  const groups: GroupNode[] = [];
  for (const bucket of groupByWorkspace(list, workspaces, archived, view.ungroupedOrder)) {
    const expanded = expandedGroups.has(bucket.key);
    groups.push({
      key: bucket.key,
      workspaceId: bucket.workspaceId,
      cwd: bucket.cwd,
      createdAt: bucket.createdAt,
      label: bucket.label,
      sessionCount: bucket.members.length,
      expanded,
      containsCurrent: bucket.key === currentGroup,
      sessions: expanded
        ? bucket.members.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
        : [],
    });
  }
  return groups;
}

/**
 * 推导「单列模式」扁平列表：每条会话一行，严格最新在前（含 id 平局裁决），
 * 无分组、无父子邻接；归档行剔除。
 */
export function deriveFlat(
  list: ThreadListSnapshot,
  archivedThreadIds: readonly string[],
): SessionNode[] {
  const archived = new Set(archivedThreadIds);
  const rows: ThreadSummary[] = [];
  for (const id of list.ids) {
    const s = list.byId[id];
    if (s === undefined || archived.has(id)) continue;
    rows.push(s);
  }
  rows.sort(byRecency);
  return rows.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }));
}

/** relativeTime 的桶单位。 */
export type RelativeTimeUnit = "now" | "minutes" | "hours" | "days" | "months" | "years";

/** 结构化相对时间：桶 + 数量（now 时为 0）。 */
export interface RelativeTime {
  unit: RelativeTimeUnit;
  n: number;
}

/**
 * 会话行尾部的紧凑相对时间，渲染层负责本地化（en: "now"/"5min"/"3h"…）。
 * @param updatedAt 最近活动时刻（epoch ms）。
 * @param now 当前时刻（注入以保持纯函数）。
 */
export function relativeTime(updatedAt: number, now: number): RelativeTime {
  const MIN = 60_000;
  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  const diff = Math.max(0, now - updatedAt);
  if (diff < MIN) return { unit: "now", n: 0 };
  if (diff < HOUR) return { unit: "minutes", n: Math.floor(diff / MIN) };
  if (diff < DAY) return { unit: "hours", n: Math.floor(diff / HOUR) };
  if (diff < 30 * DAY) return { unit: "days", n: Math.floor(diff / DAY) };
  if (diff < 365 * DAY) return { unit: "months", n: Math.floor(diff / (30 * DAY)) };
  return { unit: "years", n: Math.floor(diff / (365 * DAY)) };
}
