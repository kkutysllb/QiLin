import { useEffect, useRef } from "react";

/**
 * 全局「新任务」草稿的工作区重置：/workspace/chats/new（URL 不带
 * ``?workspace=``）打开的草稿不继承任何工作区选择记录，回到「未分组
 * （未选择）」状态。
 *
 * 背景：``updateThreadSettings`` 会把工作区选择写穿到全局 baseSettings，
 * ``useThreadSettings`` 对全新 threadId 回落该全局值——不清掉的话，全局
 * 新任务页的默认工作区永远是「上一个任务的工作区」。
 *
 * 边界：
 * - URL 显式携带 ``?workspace=`` 的新建意图由 ``useWorkspaceParamPreset``
 *   负责，本 hook 不插手；
 * - 只清工作区两个字段（workspace_id / user_workspace_path），草稿的
 *   其他上下文（模型、推理深度等）照常继承全局默认；
 * - onReset 走 settings 的 context 合并通路：既给当前草稿写入「显式未
 *   选择」的线程级覆盖（防其他标签页的全局记录中途渗入），也把全局
 *   遗留记录一并清掉——即「不做任何选择记录」；
 * - 线程级覆盖已存在（``hasOverride``）时绝不插手：覆盖要么是用户在本
 *   草稿里主动做出的工作区选择、要么是本 hook 之前写入的「显式未选择」。
 *   无此守卫时，用户选完工作区的下一帧就会被本 effect 当成「遗留」清掉，
 *   发送的 run 不带 workspace_id，后端沙箱锚到空 staging 目录（agent
 *   报「工作区是空的」）。
 */
export interface WorkspaceDraftResetOptions {
  /** 仅新会话草稿态生效。 */
  isNewThread: boolean;
  /** URL 是否显式携带 ?workspace=（此时由参数预设 hook 负责，跳过重置）。 */
  hasWorkspaceParam: boolean;
  /** 该草稿是否已有线程级 workspace 覆盖（用户选择或显式空均算）。 */
  hasOverride: boolean;
  /** 草稿当前的工作区选择（含从全局记录回落下来的值）。 */
  workspaceId: string | undefined;
  /** 草稿当前的工作区路径。 */
  workspacePath: string | undefined;
  /** 清空选择的回调（partial patch）。 */
  onReset: () => void;
}

export function useWorkspaceDraftReset({
  isNewThread,
  hasWorkspaceParam,
  hasOverride,
  workspaceId,
  workspacePath,
  onReset,
}: WorkspaceDraftResetOptions): void {
  // onReset 每渲染都是新闭包；经 ref 取最新值，避免 effect 依赖扩散。
  const resetRef = useRef(onReset);
  resetRef.current = onReset;

  useEffect(() => {
    if (!isNewThread || hasWorkspaceParam) return;
    if (hasOverride) return;
    if (workspaceId === undefined && workspacePath === undefined) return;
    resetRef.current();
  }, [isNewThread, hasWorkspaceParam, hasOverride, workspaceId, workspacePath]);
}
