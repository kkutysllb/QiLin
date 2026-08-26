import type { Message } from "@langchain/langgraph-sdk";
import { useMemo } from "react";

export interface TodoItem {
  content?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * 从 messages 中提取最新一组 todos。
 * todos 通过 write_todos 工具写入，倒序找最新一次调用的 args.todos。
 */
export function useThreadTodos(messages: Message[]): TodoItem[] {
  return useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.type === "ai") {
        const toolCalls =
          (
            msg as {
              tool_calls?: Array<{
                name: string;
                args: { todos?: TodoItem[] };
              }>;
            }
          ).tool_calls ?? [];
        const writeTodos = toolCalls.find((c) => c.name === "write_todos");
        if (writeTodos?.args?.todos) {
          return writeTodos.args.todos;
        }
      }
    }
    return [];
  }, [messages]);
}
