import type { Message, Thread } from "@langchain/langgraph-sdk";

import type { Todo } from "../todos";

/** 后端 SkillEntry 的前端镜像（thread_state.SkillEntry）。 */
export interface SkillContextEntry {
  name: string;
  path: string;
  description: string;
  loaded_at: number;
}

export interface AgentThreadState extends Record<string, unknown> {
  title: string;
  messages: Message[];
  artifacts: string[];
  context?: Partial<AgentThreadContext>;
  todos?: Todo[];
  /** 本会话已加载的技能列表（后端 skill_context 频道）。 */
  skill_context?: SkillContextEntry[];
}

export interface AgentThreadContext extends Record<string, unknown> {
  thread_id: string;
  model_name: string | undefined;
  thinking_enabled: boolean;
  is_plan_mode: boolean;
  subagent_enabled: boolean;
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
  agent_name?: string;
  /**
   * Per-thread user-selected workspace directory.
   *
   * When set, the backend's sandbox grants bash/read/write access to
   * this directory for the current thread. Forwarded via the gateway's
   * ``_CONTEXT_CONFIGURABLE_KEYS`` whitelist and injected into
   * ``thread_data`` by ``ThreadDataMiddleware``. Falls back to the
   * default user data root (~/.kworks) when absent.
   */
  user_workspace_path?: string;
}

export interface AgentThread extends Thread<AgentThreadState> {
  context?: AgentThreadContext;
}

export interface RunMessage {
  run_id: string;
  content: Message;
  metadata: {
    caller: string;
  };
  created_at: string;
}
