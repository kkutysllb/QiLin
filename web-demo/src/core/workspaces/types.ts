/**
 * 工作区注册表 REST 面（/api/workspaces）的前端镜像类型。
 * 与 app/gateway/routers/workspaces.py 的投影逐字段对齐；
 * 详见 plans/2026-08-27-dsh-alignment-refactor.md §3.4。
 */

/** 注册表实体行（GET /api/workspaces 列表项）。 */
export interface WorkspaceView {
  /** 注册表实体 id（uuid）——不是路径。 */
  id: string;
  canonical_path: string;
  title: string;
  created_at: string;
  updated_at: string;
  /** 持久展示序（越小越靠前）。 */
  position: number | null;
  /** 账户内线程 id，手动拥有的展示序。 */
  session_ids: string[];
}

/** 树投影行（GET /api/workspaces/tree 的 workspaces[] 项）。 */
export interface WorkspaceTreeNode {
  id: string;
  path: string;
  title: string;
  created_at: string;
  updated_at: string;
  position: number | null;
  /** 已滤掉归档与失效 header 的账户线程，手动序。 */
  thread_ids: string[];
}

/** GET /api/workspaces/tree 的整体响应。 */
export interface WorkspaceTreeResponse {
  workspaces: WorkspaceTreeNode[];
  /** 归属无人认领（cwd 未捕获 / 已 detach / 工作区被删）的可见线程。 */
  ungrouped_thread_ids: string[];
  /** 注册表全局归档集。 */
  archived_thread_ids: string[];
}

/** 后端稳定错误码词汇（WorkspaceError.code 与 HTTPException detail.code 并集）。 */
export type WorkspaceErrorCode =
  | "WORKSPACE_NOT_FOUND"
  | "THREAD_NOT_ACCOUNTED"
  | "WORKSPACE_STORE_UNAVAILABLE"
  | "WORKSPACE_PATH_INVALID"
  | "unknown";
