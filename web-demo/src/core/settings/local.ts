import type { AgentThreadContext } from "../threads";

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
export const RECENT_WORKSPACE_PATHS_KEY = "kworks.recent-workspace-paths";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

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
    reasoning_effort?: "minimal" | "low" | "medium" | "high";
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

function getThreadModelStorageKey(threadId: string): string {
  return `${THREAD_MODEL_KEY_PREFIX}${threadId}`;
}

export function getThreadModelName(threadId: string): string | undefined {
  if (!isBrowser()) {
    return undefined;
  }
  return localStorage.getItem(getThreadModelStorageKey(threadId)) ?? undefined;
}

export function saveThreadModelName(
  threadId: string,
  modelName: string | undefined,
) {
  if (!isBrowser()) {
    return;
  }
  const key = getThreadModelStorageKey(threadId);
  if (!modelName) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, modelName);
}

export function applyThreadModelOverride(
  settings: LocalSettings,
  threadModelName: string | undefined,
): LocalSettings {
  if (!threadModelName) {
    return settings;
  }
  return {
    ...settings,
    context: {
      ...settings.context,
      model_name: threadModelName,
    },
  };
}

// ------------------------------------------------------------------
// Per-thread agent_name persistence
// ------------------------------------------------------------------
// Once a thread is created with a specific lead agent, the agent_name
// is "locked" for that thread so reopening it always uses the same
// Lead Agent preset.

function getThreadAgentStorageKey(threadId: string): string {
  return `${THREAD_AGENT_KEY_PREFIX}${threadId}`;
}

export function getThreadAgentName(threadId: string): string | undefined {
  if (!isBrowser()) {
    return undefined;
  }
  const raw = localStorage.getItem(getThreadAgentStorageKey(threadId));
  // ``null`` = no stored value → fall back to global settings.
  // The string "__default__" represents the explicit "office" mode
  // (agent_name = undefined) so it can be distinguished from "no value".
  if (raw === null) return undefined;
  return raw === "__default__" ? undefined : raw;
}

export function saveThreadAgentName(
  threadId: string,
  agentName: string | undefined,
) {
  if (!isBrowser()) {
    return;
  }
  const key = getThreadAgentStorageKey(threadId);
  if (agentName === undefined) {
    // Store a sentinel so we know the thread was explicitly created
    // in the default "office" mode (vs. an old thread with no override).
    localStorage.setItem(key, "__default__");
  } else {
    localStorage.setItem(key, agentName);
  }
}

export function applyThreadAgentOverride(
  settings: LocalSettings,
  threadAgentName: string | undefined,
  hasThreadAgentOverride: boolean,
): LocalSettings {
  if (!hasThreadAgentOverride) {
    return settings;
  }
  return {
    ...settings,
    context: {
      ...settings.context,
      agent_name: threadAgentName,
    },
  };
}

// ------------------------------------------------------------------
// Per-thread user_workspace_path persistence
// ------------------------------------------------------------------
// Stores the user-selected workspace directory so the sandbox can grant
// bash/read/write access to it for the current thread.

function getThreadWorkspacePathStorageKey(threadId: string): string {
  return `${THREAD_WORKSPACE_PATH_KEY_PREFIX}${threadId}`;
}

export function getThreadWorkspacePath(
  threadId: string,
): string | undefined {
  if (!isBrowser()) {
    return undefined;
  }
  const raw = localStorage.getItem(getThreadWorkspacePathStorageKey(threadId));
  // ``null`` = no stored value → fall back to default workspace.
  // The empty string "" represents the explicit default workspace
  // (user_workspace_path = undefined) so it can be distinguished from
  // "no value".
  if (raw === null) return undefined;
  return raw === "" ? undefined : raw;
}

export function saveThreadWorkspacePath(
  threadId: string,
  workspacePath: string | undefined,
) {
  if (!isBrowser()) {
    return;
  }
  const key = getThreadWorkspacePathStorageKey(threadId);
  if (workspacePath === undefined) {
    // Store a sentinel so we know the thread was explicitly created
    // in the default workspace (vs. an old thread with no override).
    localStorage.setItem(key, "");
  } else {
    localStorage.setItem(key, workspacePath);
    // Also track in recent paths list (most-recent-first, deduped, max 5)
    addRecentWorkspacePath(workspacePath);
  }
}

export function applyThreadWorkspacePathOverride(
  settings: LocalSettings,
  threadWorkspacePath: string | undefined,
  hasThreadWorkspacePathOverride: boolean,
): LocalSettings {
  if (!hasThreadWorkspacePathOverride) {
    return settings;
  }
  return {
    ...settings,
    context: {
      ...settings.context,
      user_workspace_path: threadWorkspacePath,
    },
  };
}

// ------------------------------------------------------------------
// Recent workspace paths (cross-thread, for the selector dropdown)
// ------------------------------------------------------------------

export function getRecentWorkspacePaths(): string[] {
  if (!isBrowser()) {
    return [];
  }
  try {
    const raw = localStorage.getItem(RECENT_WORKSPACE_PATHS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, 5);
  } catch {
    return [];
  }
}

export function addRecentWorkspacePath(path: string): void {
  if (!isBrowser() || !path) {
    return;
  }
  const current = getRecentWorkspacePaths();
  // Dedupe (case-insensitive on macOS/Windows, case-sensitive on Linux)
  const deduped = current.filter(
    (item) => item.toLowerCase() !== path.toLowerCase(),
  );
  deduped.unshift(path);
  localStorage.setItem(
    RECENT_WORKSPACE_PATHS_KEY,
    JSON.stringify(deduped.slice(0, 5)),
  );
}

export function clearRecentWorkspacePaths(): void {
  if (!isBrowser()) {
    return;
  }
  localStorage.removeItem(RECENT_WORKSPACE_PATHS_KEY);
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
          } as Record<string, "minimal" | "low" | "medium" | "high">
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
