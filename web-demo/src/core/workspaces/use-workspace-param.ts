import { useEffect, useRef } from "react";

/**
 * 「组头 + 新会话」深链参数预设：/workspace/chats/new?workspace=<id>。
 *
 * URL 显式携带的工作区参数代表一次明确的新建意图，必须覆盖全局
 * baseSettings 遗留的「上一个任务工作区」默认记录（useThreadSettings 对
 * 全新 threadId 会回落全局值，遗留记录会让 input-box 里旧的
 * `context?.workspace_id` 守卫把参数吞掉，表现为新会话页永远停在上一个
 * 任务的工作区）。
 *
 * 生效时机与边界：
 * - 仅新会话草稿态（isNewThread）且参数能命中已加载的工作区列表；
 * - 同一草稿（threadId 不变）内同一参数只生效一次，之后用户手动切换
 *   工作区不被回抢；threadId 变化（又开了一个新草稿）或参数值变化
 *   （点了另一个工作区的 +）则重新生效；
 * - onApply 收到的是 partial patch，走 settings 的 context 合并通路，
 *   不会覆盖草稿里并发更新的其他字段（如模型默认值同步）。
 */
export interface WorkspaceParamPresetOptions {
  /** URL 携带的工作区 id（searchParams.get("workspace")），无参数为 null。 */
  workspaceParam: string | null;
  /** 仅新会话草稿态生效。 */
  isNewThread: boolean;
  /** 当前草稿的 threadId；变化视为新开了一个草稿，参数重新生效。 */
  threadId: string;
  /** 已加载的工作区列表；为空（尚在加载）时等待，不消费参数。 */
  workspaces: readonly { id: string; path?: string | undefined }[];
  /** 参数命中且可应用时的回调（partial patch）。 */
  onApply: (patch: {
    workspace_id: string;
    user_workspace_path: string | undefined;
  }) => void;
}

export function useWorkspaceParamPreset({
  workspaceParam,
  isNewThread,
  threadId,
  workspaces,
  onApply,
}: WorkspaceParamPresetOptions): void {
  // 最近一次已消费的参数值：同草稿内同值不重复应用（保护手动切换）。
  const appliedParamRef = useRef<string | undefined>(undefined);
  // 草稿更替（新 threadId）重置消费标记：再次点同一个「+ 新会话」也要生效。
  const appliedThreadRef = useRef<string | undefined>(undefined);
  if (appliedThreadRef.current !== threadId) {
    appliedThreadRef.current = threadId;
    appliedParamRef.current = undefined;
  }
  // onApply 每渲染都是新闭包；经 ref 取最新值，避免过期 context 覆盖并发变更。
  const applyRef = useRef(onApply);
  applyRef.current = onApply;

  useEffect(() => {
    if (!isNewThread || !workspaceParam) return;
    if (appliedParamRef.current === workspaceParam) return;
    if (workspaces.length === 0) return;
    const target = workspaces.find((w) => w.id === workspaceParam);
    if (!target) return;
    appliedParamRef.current = workspaceParam;
    applyRef.current({
      workspace_id: target.id,
      user_workspace_path: target.path,
    });
  }, [isNewThread, workspaceParam, threadId, workspaces]);
}
