"use client";

import { cn } from "@/lib/utils";

import { ThreadContext } from "../messages/context";

import { ChatBox } from "./chat-box";
import type { ChatPageController } from "./use-chat-page-controller";

// [-webkit-app-region:drag] makes the header a window-drag zone on Electron
// so double-click toggles macOS maximize, matching the landing page title-bar
// behavior. 新任务草稿态无标题栏投影，进入会话后切换为毛玻璃 + 阴影。
const HEADER_BASE_CLASS =
  "absolute top-0 right-0 left-0 z-30 flex h-12 shrink-0 items-center px-4 [-webkit-app-region:drag]";
const HEADER_NEW_THREAD_CLASS = "bg-background/0 backdrop-blur-none";
const HEADER_ACTIVE_THREAD_CLASS = "bg-background/80 shadow-xs backdrop-blur";

export interface ChatPageShellProps {
  controller: ChatPageController;
  /**
   * header 追加类：workspace 页传 "justify-end"（仅右侧工具），agent 页传
   * "gap-2"（徽标 + 标题 + 操作横向排布）。两页显式传入，禁止 shell 内
   * 按 scope 分叉。
   */
  headerClassName?: string;
  /** header 内容插槽。 */
  header?: React.ReactNode;
  /** 主内容插槽：消息区 + 输入区。 */
  children: React.ReactNode;
}

/**
 * 双路由聊天页共享外壳：ThreadContext.Provider + ChatBox + 窗口拖拽
 * header + 主内容纵向骨架。页面差异全部通过 header/headerClassName/
 * children 插槽显式注入。
 */
export function ChatPageShell({
  controller,
  headerClassName,
  header,
  children,
}: ChatPageShellProps) {
  return (
    <ThreadContext.Provider value={controller.threadContextValue}>
      <ChatBox threadId={controller.threadId}>
        <div className="relative flex size-full min-h-0 justify-between">
          <header
            className={cn(
              HEADER_BASE_CLASS,
              headerClassName,
              controller.isNewThread
                ? HEADER_NEW_THREAD_CLASS
                : HEADER_ACTIVE_THREAD_CLASS,
            )}
          >
            {header}
          </header>
          <main className="flex min-h-0 max-w-full grow flex-col">
            {children}
          </main>
        </div>
      </ChatBox>
    </ThreadContext.Provider>
  );
}
