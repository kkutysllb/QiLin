import type { ReasoningEffort } from "../agents/types";
import type { AgentThreadContext } from "../threads";

import { isBrowser, parseRawThreadFieldValue } from "./thread-field";

export type MessageWidth = "narrow" | "medium" | "wide";
export type MessageFontSize = "small" | "medium" | "large";
export type MessageLineHeight = "compact" | "comfortable" | "relaxed";

/** 消息正文区域的阅读外观设置（全局，非 per-thread）。 */
export interface MessageAppearanceSettings {
  /** 消息正文最大宽度。 */
  width: MessageWidth;
  /** 消息正文字体大小。 */
  fontSize: MessageFontSize;
  /** 消息正文行间距。 */
  lineHeight: MessageLineHeight;
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  notification: {
    enabled: true,
  },
  appearance: {
    width: "medium",
    fontSize: "medium",
    lineHeight: "comfortable",
  },
  context: {
    model_name: undefined,
    reasoning_effort: undefined,
  },
};

export const LOCAL_SETTINGS_KEY = "kworks.local-settings";
export const THREAD_MODEL_KEY_PREFIX = "kworks.thread-model.";
export const THREAD_AGENT_KEY_PREFIX = "kworks.thread-agent.";
export const THREAD_WORKSPACE_PATH_KEY_PREFIX = "kworks.thread-workspace-path.";
export const THREAD_WORKSPACE_ID_KEY_PREFIX = "kworks.thread-workspace-id.";

/**
 * localStorage sentinel meaning "explicitly reset to the default value":
 * writing it distinguishes "user picked the default" from "no stored value"
 * (``null``), which still falls back to the global settings. Used for the
 * per-thread agent_name field (``kworks.thread-agent.*``); the agent wizard
 * reuses the same literal as the neutral "默认" Select option value.
 */
export const DEFAULT_SENTINEL = "__default__";

export interface LocalSettings {
  notification: {
    enabled: boolean;
  };
  appearance: MessageAppearanceSettings;
  context: Omit<
    AgentThreadContext,
    | "thread_id"
    | "is_plan_mode"
    | "thinking_enabled"
    | "subagent_enabled"
    | "model_name"
    | "reasoning_effort"
  > & {
    model_name?: string | undefined;
    reasoning_effort?: ReasoningEffort;
  };
}

function mergeLocalSettings(settings?: Partial<LocalSettings>): LocalSettings {
  return {
    ...DEFAULT_LOCAL_SETTINGS,
    context: {
      ...DEFAULT_LOCAL_SETTINGS.context,
      ...settings?.context,
    },
    notification: {
      ...DEFAULT_LOCAL_SETTINGS.notification,
      ...settings?.notification,
    },
    appearance: {
      ...DEFAULT_LOCAL_SETTINGS.appearance,
      ...settings?.appearance,
    },
  };
}

// ------------------------------------------------------------------
// Per-thread 覆写字段工厂（settings 内部共享件）
// ------------------------------------------------------------------
// model / agent / workspace-path / workspace-id 四组「storage key + 读写 +
// apply 覆写」样板仅 key 前缀、context 字段名、sentinel 三者不同，统一由
// createThreadOverrideField 参数化生成；sentinel 三态解析复用 thread-field.ts
// 的唯一实现。下方 4 个 field 实例导出供 store.ts 复用（前缀 + sentinel 的
// 单一来源），不属于对外稳定 API。

/** per-thread 覆写写穿到 ``LocalSettings.context`` 的字段名。 */
export type ThreadContextFieldName =
  | "model_name"
  | "agent_name"
  | "user_workspace_path"
  | "workspace_id";

interface ThreadOverrideFieldConfig {
  /** localStorage key 前缀；完整 key = ``${keyPrefix}${threadId}``。 */
  keyPrefix: string;
  /** 覆写写穿到 ``LocalSettings.context`` 的字段名。 */
  field: ThreadContextFieldName;
  /**
   * 「显式恢复默认」sentinel：保存 ``undefined`` 时写入该字符串而非删除
   * key，用于区分「用户显式选了默认」与「从未存储」（后者回落全局设置）。
   * 缺省表示无三态语义：保存 falsy 直接移除 key（如 model_name）。
   */
  sentinel?: string;
}

interface ThreadOverrideField {
  readonly keyPrefix: string;
  readonly sentinel: string | undefined;
  storageKey(threadId: string): string;
  /** 读取覆写值：key 不存在 / sentinel → ``undefined``，否则原值。 */
  read(threadId: string): string | undefined;
  save(threadId: string, value: string | undefined): void;
  apply(
    settings: LocalSettings,
    value: string | undefined,
    hasOverride?: boolean,
  ): LocalSettings;
}

function createThreadOverrideField(
  config: ThreadOverrideFieldConfig,
): ThreadOverrideField {
  const { keyPrefix, field, sentinel } = config;
  const storageKey = (threadId: string) => `${keyPrefix}${threadId}`;
  return {
    keyPrefix,
    sentinel,
    storageKey,
    read(threadId) {
      if (!isBrowser()) {
        return undefined;
      }
      return parseRawThreadFieldValue(
        localStorage.getItem(storageKey(threadId)),
        sentinel,
      ).value;
    },
    save(threadId, value) {
      if (!isBrowser()) {
        return;
      }
      const key = storageKey(threadId);
      if (sentinel === undefined) {
        // 无三态语义：清空即移除 key，回落全局设置。
        if (!value) {
          localStorage.removeItem(key);
          return;
        }
        localStorage.setItem(key, value);
        return;
      }
      if (value === undefined) {
        // 写入 sentinel，把「显式恢复默认」与「从未存储」区分开。
        localStorage.setItem(key, sentinel);
        return;
      }
      localStorage.setItem(key, value);
    },
    apply(settings, value, hasOverride) {
      // 无 sentinel 型：值为 falsy 时不覆写；sentinel 型：仅存在显式覆写
      // （hasOverride）时写穿——值可为 undefined，代表「显式恢复默认」。
      if (sentinel === undefined) {
        if (!value) {
          return settings;
        }
      } else if (!hasOverride) {
        return settings;
      }
      return {
        ...settings,
        context: {
          ...settings.context,
          [field]: value,
        } as LocalSettings["context"],
      };
    },
  };
}

/** Per-thread model 覆写字段：无 sentinel，保存 falsy 直接移除 key。 */
export const threadModelField = createThreadOverrideField({
  keyPrefix: THREAD_MODEL_KEY_PREFIX,
  field: "model_name",
});

// Once a thread is created with a specific lead agent, the agent_name
// is "locked" for that thread so reopening it always uses the same
// Lead Agent preset.
export const threadAgentField = createThreadOverrideField({
  keyPrefix: THREAD_AGENT_KEY_PREFIX,
  field: "agent_name",
  sentinel: DEFAULT_SENTINEL,
});

// Stores the user-selected workspace directory so the sandbox can grant
// bash/read/write access to it for the current thread. The empty string ""
// sentinel represents the explicit default workspace.
export const threadWorkspacePathField = createThreadOverrideField({
  keyPrefix: THREAD_WORKSPACE_PATH_KEY_PREFIX,
  field: "user_workspace_path",
  sentinel: "",
});

// The user-selected registry workspace id (drives sidebar grouping) lives
// globally in baseSettings.context, which leaks across threads and is not
// durable per thread. Snapshot it per-thread exactly like user_workspace_path
// so reopening a thread restores the same workspace binding after refresh.
export const threadWorkspaceIdField = createThreadOverrideField({
  keyPrefix: THREAD_WORKSPACE_ID_KEY_PREFIX,
  field: "workspace_id",
  sentinel: "",
});

// ------------------------------------------------------------------
// 对外导出面（历史签名逐字保持；实现委托给上方 field 实例）
// ------------------------------------------------------------------

export function getThreadModelName(threadId: string): string | undefined {
  return threadModelField.read(threadId);
}

export function saveThreadModelName(
  threadId: string,
  modelName: string | undefined,
) {
  threadModelField.save(threadId, modelName);
}

export function applyThreadModelOverride(
  settings: LocalSettings,
  threadModelName: string | undefined,
): LocalSettings {
  return threadModelField.apply(settings, threadModelName);
}

// Per-thread agent_name persistence（语义见 threadAgentField 注释）。

export function getThreadAgentName(threadId: string): string | undefined {
  return threadAgentField.read(threadId);
}

export function saveThreadAgentName(
  threadId: string,
  agentName: string | undefined,
) {
  threadAgentField.save(threadId, agentName);
}

export function applyThreadAgentOverride(
  settings: LocalSettings,
  threadAgentName: string | undefined,
  hasThreadAgentOverride: boolean,
): LocalSettings {
  return threadAgentField.apply(
    settings,
    threadAgentName,
    hasThreadAgentOverride,
  );
}

// Per-thread user_workspace_path persistence（语义见 threadWorkspacePathField
// 注释）。

export function getThreadWorkspacePath(
  threadId: string,
): string | undefined {
  return threadWorkspacePathField.read(threadId);
}

export function saveThreadWorkspacePath(
  threadId: string,
  workspacePath: string | undefined,
) {
  threadWorkspacePathField.save(threadId, workspacePath);
}

export function applyThreadWorkspacePathOverride(
  settings: LocalSettings,
  threadWorkspacePath: string | undefined,
  hasThreadWorkspacePathOverride: boolean,
): LocalSettings {
  return threadWorkspacePathField.apply(
    settings,
    threadWorkspacePath,
    hasThreadWorkspacePathOverride,
  );
}

// Per-thread workspace_id snapshot（语义见 threadWorkspaceIdField 注释）。

export function getThreadWorkspaceId(threadId: string): string | undefined {
  return threadWorkspaceIdField.read(threadId);
}

export function saveThreadWorkspaceId(
  threadId: string,
  workspaceId: string | undefined,
) {
  threadWorkspaceIdField.save(threadId, workspaceId);
}

export function applyThreadWorkspaceIdOverride(
  settings: LocalSettings,
  threadWorkspaceId: string | undefined,
  hasThreadWorkspaceIdOverride: boolean,
): LocalSettings {
  return threadWorkspaceIdField.apply(
    settings,
    threadWorkspaceId,
    hasThreadWorkspaceIdOverride,
  );
}

export function getLocalSettings(): LocalSettings {
  if (!isBrowser()) {
    return DEFAULT_LOCAL_SETTINGS;
  }
  const json = localStorage.getItem(LOCAL_SETTINGS_KEY);
  try {
    if (json) {
      const settings = JSON.parse(json) as Partial<LocalSettings> & {
        context?: Partial<LocalSettings["context"]> & { mode?: string };
      };
      // 一次性迁移：旧版「模式」字段（flash/thinking/pro/ultra）映射为
      // 推理深度档位（minimal/low/medium/high）后删除，随后写回清理。
      const rawMode = settings.context?.mode;
      if (rawMode && settings.context) {
        const ctx = settings.context;
        const migrated = (
          {
            ultra: "high",
            pro: "medium",
            thinking: "low",
            flash: "minimal",
          } as Record<string, ReasoningEffort>
        )[rawMode];
        if (migrated && !ctx.reasoning_effort) {
          ctx.reasoning_effort = migrated;
        }
        delete ctx.mode;
        saveLocalSettings(mergeLocalSettings(settings));
      }
      return mergeLocalSettings(settings);
    }
  } catch {}
  return DEFAULT_LOCAL_SETTINGS;
}

export function saveLocalSettings(settings: LocalSettings) {
  if (!isBrowser()) {
    return;
  }
  localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
}
