import {
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_SETTINGS_KEY,
  getLocalSettings,
  saveLocalSettings,
  saveThreadAgentName,
  saveThreadModelName,
  saveThreadWorkspaceId,
  saveThreadWorkspacePath,
  threadAgentField,
  threadModelField,
  threadWorkspaceIdField,
  threadWorkspacePathField,
  type LocalSettings,
  type ThreadContextFieldName,
} from "./local";
import { parseRawThreadFieldValue } from "./thread-field";

type Listener = () => void;

export type LocalSettingsSetter = <K extends keyof LocalSettings>(
  key: K,
  value: Partial<LocalSettings[K]>,
) => void;

type ThreadContextSettingsPatch = Partial<LocalSettings["context"]> & {
  model_name?: string | undefined;
  agent_name?: string | undefined;
  user_workspace_path?: string | undefined;
};

const listeners = new Set<Listener>();

let baseSettings: LocalSettings = DEFAULT_LOCAL_SETTINGS;
let baseSettingsLoaded = false;
let storageListenerRegistered = false;

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function ensureBaseSettingsLoaded() {
  if (baseSettingsLoaded || typeof window === "undefined") {
    return;
  }

  baseSettings = getLocalSettings();
  baseSettingsLoaded = true;
}

function ensureStorageListenerRegistered() {
  if (storageListenerRegistered || typeof window === "undefined") {
    return;
  }

  window.addEventListener("storage", handleStorage);
  storageListenerRegistered = true;
}

function mergeSettingsSection<K extends keyof LocalSettings>(
  settings: LocalSettings,
  key: K,
  value: Partial<LocalSettings[K]>,
): LocalSettings {
  return {
    ...settings,
    [key]: {
      ...settings[key],
      ...value,
    },
  } as LocalSettings;
}

// ------------------------------------------------------------------
// Per-thread 快照字段工厂（settings 内部共享件）
// ------------------------------------------------------------------
// model（单 map）与 agent / workspace-path / workspace-id（map + override 集
// + refresh）的快照样板同构，仅 key 前缀与 sentinel 不同：统一由
// createThreadSnapshotField 参数化生成。key 前缀 / sentinel 复用 local.ts 的
// field 实例（单一来源），sentinel 三态解析复用 thread-field.ts 的唯一实现。

interface ThreadSnapshotFieldConfig {
  /** 对应 local.ts 的覆写字段实例，提供 keyPrefix / sentinel / read。 */
  keyPrefix: string;
  sentinel: string | undefined;
  /** 读取覆写值（含 SSR 守卫与 sentinel 回退），model 型 refresh 用。 */
  read: (threadId: string) => string | undefined;
}

interface ThreadSnapshotField {
  readonly keyPrefix: string;
  /** 从 localStorage 重读该 thread 的覆写记录并回填缓存。 */
  refresh(threadId: string): void;
  /** 写穿一条已知覆写（updateThreadSettings 用），绕过 localStorage 重读。 */
  storeOverride(threadId: string, value: string | undefined): void;
  getSnapshot(threadId: string): string | undefined;
  hasOverride(threadId: string): boolean;
  clearAll(): void;
}

function createThreadSnapshotField(
  config: ThreadSnapshotFieldConfig,
): ThreadSnapshotField {
  const { keyPrefix, sentinel, read } = config;
  const hasSentinel = sentinel !== undefined;
  const values = new Map<string, string | undefined>();
  const overrides = new Set<string>();

  const refresh = (threadId: string) => {
    if (!hasSentinel) {
      // model 型：无 override 概念，始终回写（含 undefined）。
      values.set(threadId, read(threadId));
      return;
    }
    const parsed = parseRawThreadFieldValue(
      localStorage.getItem(`${keyPrefix}${threadId}`),
      sentinel,
    );
    if (!parsed.present) {
      // 从未存储：回落全局设置，缓存视为「无覆写」。
      values.delete(threadId);
      overrides.delete(threadId);
      return;
    }
    overrides.add(threadId);
    values.set(threadId, parsed.value);
  };

  return {
    keyPrefix,
    refresh,
    storeOverride(threadId, value) {
      if (hasSentinel) {
        overrides.add(threadId);
      }
      values.set(threadId, value);
    },
    getSnapshot(threadId) {
      const cached = hasSentinel
        ? overrides.has(threadId)
        : values.has(threadId);
      if (!cached) {
        refresh(threadId);
      }
      return values.get(threadId);
    },
    hasOverride(threadId) {
      if (!hasSentinel) {
        return false;
      }
      if (!overrides.has(threadId)) {
        refresh(threadId);
      }
      return overrides.has(threadId);
    },
    clearAll() {
      values.clear();
      overrides.clear();
    },
  };
}

// key 前缀 / sentinel 与 local.ts 的 field 实例同源，杜绝两文件漂移。
const threadModelSnapshots = createThreadSnapshotField(threadModelField);
const threadAgentSnapshots = createThreadSnapshotField(threadAgentField);
const threadWorkspacePathSnapshots = createThreadSnapshotField(
  threadWorkspacePathField,
);
const threadWorkspaceIdSnapshots = createThreadSnapshotField(
  threadWorkspaceIdField,
);

/** storage 事件按 keyPrefix 分发；顺序与历史实现一致（前缀互斥）。 */
const threadSnapshotFields = [
  threadModelSnapshots,
  threadAgentSnapshots,
  threadWorkspacePathSnapshots,
  threadWorkspaceIdSnapshots,
];

/** updateThreadSettings 的 context 字段写穿注册表（顺序与历史 if 块一致）。 */
const threadContextFieldBindings: ReadonlyArray<{
  field: ThreadContextFieldName;
  snapshot: ThreadSnapshotField;
  save: (threadId: string, value: string | undefined) => void;
}> = [
  {
    field: "model_name",
    snapshot: threadModelSnapshots,
    save: saveThreadModelName,
  },
  {
    field: "agent_name",
    snapshot: threadAgentSnapshots,
    save: saveThreadAgentName,
  },
  {
    field: "user_workspace_path",
    snapshot: threadWorkspacePathSnapshots,
    save: saveThreadWorkspacePath,
  },
  {
    field: "workspace_id",
    snapshot: threadWorkspaceIdSnapshots,
    save: saveThreadWorkspaceId,
  },
];

function handleStorage(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== localStorage) {
    return;
  }

  ensureBaseSettingsLoaded();

  if (event.key === null) {
    baseSettings = getLocalSettings();
    for (const snapshot of threadSnapshotFields) {
      snapshot.clearAll();
    }
    emitChange();
    return;
  }

  if (event.key === LOCAL_SETTINGS_KEY) {
    baseSettings = getLocalSettings();
    emitChange();
    return;
  }

  for (const snapshot of threadSnapshotFields) {
    if (event.key.startsWith(snapshot.keyPrefix)) {
      snapshot.refresh(event.key.slice(snapshot.keyPrefix.length));
      emitChange();
      return;
    }
  }
}

export function subscribe(listener: Listener): () => void {
  ensureBaseSettingsLoaded();
  ensureStorageListenerRegistered();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getBaseSettingsSnapshot(): LocalSettings {
  ensureBaseSettingsLoaded();
  return baseSettings;
}

export function getThreadModelSnapshot(threadId: string): string | undefined {
  ensureBaseSettingsLoaded();
  return threadModelSnapshots.getSnapshot(threadId);
}

export function getThreadAgentSnapshot(
  threadId: string,
): string | undefined {
  ensureBaseSettingsLoaded();
  return threadAgentSnapshots.getSnapshot(threadId);
}

export function hasThreadAgentOverride(threadId: string): boolean {
  ensureBaseSettingsLoaded();
  return threadAgentSnapshots.hasOverride(threadId);
}

// Per-thread user_workspace_path snapshot

export function getThreadWorkspacePathSnapshot(
  threadId: string,
): string | undefined {
  ensureBaseSettingsLoaded();
  return threadWorkspacePathSnapshots.getSnapshot(threadId);
}

export function hasThreadWorkspacePathOverride(threadId: string): boolean {
  ensureBaseSettingsLoaded();
  return threadWorkspacePathSnapshots.hasOverride(threadId);
}

// Per-thread workspace_id snapshot

export function getThreadWorkspaceIdSnapshot(
  threadId: string,
): string | undefined {
  ensureBaseSettingsLoaded();
  return threadWorkspaceIdSnapshots.getSnapshot(threadId);
}

export function hasThreadWorkspaceIdOverride(threadId: string): boolean {
  ensureBaseSettingsLoaded();
  return threadWorkspaceIdSnapshots.hasOverride(threadId);
}

export const updateLocalSettings: LocalSettingsSetter = (key, value) => {
  ensureBaseSettingsLoaded();
  ensureStorageListenerRegistered();

  baseSettings = mergeSettingsSection(baseSettings, key, value);
  saveLocalSettings(baseSettings);
  emitChange();
};

export function updateThreadSettings<K extends keyof LocalSettings>(
  threadId: string,
  key: K,
  value: Partial<LocalSettings[K]>,
) {
  ensureBaseSettingsLoaded();
  ensureStorageListenerRegistered();

  const nextBaseSettings = mergeSettingsSection(baseSettings, key, value);
  baseSettings = nextBaseSettings;
  saveLocalSettings(baseSettings);

  if (key === "context") {
    const contextValue = value as ThreadContextSettingsPatch;

    for (const binding of threadContextFieldBindings) {
      if (!Object.prototype.hasOwnProperty.call(value, binding.field)) {
        continue;
      }
      const fieldValue = contextValue[binding.field] as string | undefined;
      binding.snapshot.storeOverride(threadId, fieldValue);
      binding.save(threadId, fieldValue);
    }
  }

  emitChange();
}
