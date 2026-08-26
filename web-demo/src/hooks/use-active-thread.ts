import { usePathname } from "next/navigation";

import { useThreadRuntimeSnapshot } from "@/core/threads/runtime-store";

/**
 * 从当前 URL 提取活跃会话的 threadId。
 *
 * 支持两种路由：
 * - `/workspace/chats/[thread_id]`
 * - `/workspace/agents/[agent_name]/chats/[thread_id]`
 *
 * `thread_id === "new"` 表示新建会话页，此时没有已持久化的 thread，
 * 返回 null。
 */
export function useActiveThreadId(): string | null {
  const pathname = usePathname();
  if (!pathname) return null;

  const chatMatch = pathname.match(/\/workspace\/chats\/([^/]+)/);
  if (chatMatch?.[1] && chatMatch[1] !== "new") {
    return chatMatch[1];
  }

  const agentMatch = pathname.match(
    /\/workspace\/agents\/[^/]+\/chats\/([^/]+)/,
  );
  if (agentMatch?.[1] && agentMatch[1] !== "new") {
    return agentMatch[1];
  }

  return null;
}

/**
 * 订阅当前活跃会话的实时 messages。
 *
 * 数据来源是 `useThreadStream` 通过 `publishThreadRuntimeSnapshot` 写入的
 * 模块级 runtime-store，因此任何层级的组件（Topbar、RightContextPanel 等）
 * 都能读到正在 streaming 的会话数据，无需依赖 `<ThreadContext.Provider>`。
 *
 * 非会话页面（settings/mcp/crons 等）或新建会话页返回空数组。
 */
export function useActiveThreadMessages() {
  const threadId = useActiveThreadId();
  const snapshot = useThreadRuntimeSnapshot(threadId);
  return {
    threadId,
    messages: snapshot?.messages ?? [],
    values: snapshot?.values,
  };
}
