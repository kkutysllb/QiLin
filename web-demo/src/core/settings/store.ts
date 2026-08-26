import {
  DEFAULT_LOCAL_SETTINGS,
  LOCAL_SETTINGS_KEY,
  THREAD_AGENT_KEY_PREFIX,
  THREAD_MODEL_KEY_PREFIX,
  THREAD_WORKSPACE_PATH_KEY_PREFIX,
  getLocalSettings,
  getThreadModelName,
  saveLocalSettings,
  saveThreadAgentName,
  saveThreadModelName,
  saveThreadWorkspacePath,
  type LocalSettings,
} from "./local";

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
const threadModelNames = new Map<string, string | undefined>();
const threadAgentNames = new Map<string, string | undefined>();
const threadAgentHasOverride = new Set<string>();
const threadWorkspacePaths = new Map<string, string | undefined>();
const threadWorkspacePathHasOverride = new Set<string>();

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

function handleStorage(event: StorageEvent) {
  if (event.storageArea && event.storageArea !== localStorage) {
    return;
  }

  ensureBaseSettingsLoaded();

  if (event.key === null) {
    baseSettings = getLocalSettings();
    threadModelNames.clear();
    threadAgentNames.clear();
    threadAgentHasOverride.clear();
    threadWorkspacePaths.clear();
    threadWorkspacePathHasOverride.clear();
    emitChange();
    return;
  }

  if (event.key === LOCAL_SETTINGS_KEY) {
    baseSettings = getLocalSettings();
    emitChange();
    return;
  }

  if (!event.key.startsWith(THREAD_MODEL_KEY_PREFIX)) {
    if (event.key.startsWith(THREAD_AGENT_KEY_PREFIX)) {
      const threadId = event.key.slice(THREAD_AGENT_KEY_PREFIX.length);
      _refreshThreadAgentSnapshot(threadId);
      emitChange();
      return;
    }
    if (event.key.startsWith(THREAD_WORKSPACE_PATH_KEY_PREFIX)) {
      const threadId = event.key.slice(
        THREAD_WORKSPACE_PATH_KEY_PREFIX.length,
      );
      _refreshThreadWorkspacePathSnapshot(threadId);
      emitChange();
      return;
    }
    return;
  }

  const threadId = event.key.slice(THREAD_MODEL_KEY_PREFIX.length);
  threadModelNames.set(threadId, getThreadModelName(threadId));
  emitChange();
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

  if (!threadModelNames.has(threadId)) {
    threadModelNames.set(threadId, getThreadModelName(threadId));
  }

  return threadModelNames.get(threadId);
}

function _refreshThreadAgentSnapshot(threadId: string) {
  const raw = localStorage.getItem(`${THREAD_AGENT_KEY_PREFIX}${threadId}`);
  if (raw === null) {
    threadAgentNames.delete(threadId);
    threadAgentHasOverride.delete(threadId);
  } else {
    threadAgentHasOverride.add(threadId);
    threadAgentNames.set(threadId, raw === "__default__" ? undefined : raw);
  }
}

export function getThreadAgentSnapshot(
  threadId: string,
): string | undefined {
  ensureBaseSettingsLoaded();

  if (!threadAgentHasOverride.has(threadId)) {
    _refreshThreadAgentSnapshot(threadId);
  }

  return threadAgentNames.get(threadId);
}

export function hasThreadAgentOverride(threadId: string): boolean {
  ensureBaseSettingsLoaded();

  if (!threadAgentHasOverride.has(threadId)) {
    _refreshThreadAgentSnapshot(threadId);
  }

  return threadAgentHasOverride.has(threadId);
}

// ------------------------------------------------------------------
// Per-thread user_workspace_path snapshot
// ------------------------------------------------------------------

function _refreshThreadWorkspacePathSnapshot(threadId: string) {
  const raw = localStorage.getItem(
    `${THREAD_WORKSPACE_PATH_KEY_PREFIX}${threadId}`,
  );
  if (raw === null) {
    threadWorkspacePaths.delete(threadId);
    threadWorkspacePathHasOverride.delete(threadId);
  } else {
    threadWorkspacePathHasOverride.add(threadId);
    // Empty string sentinel = explicit default workspace (path = undefined).
    threadWorkspacePaths.set(threadId, raw === "" ? undefined : raw);
  }
}

export function getThreadWorkspacePathSnapshot(
  threadId: string,
): string | undefined {
  ensureBaseSettingsLoaded();

  if (!threadWorkspacePathHasOverride.has(threadId)) {
    _refreshThreadWorkspacePathSnapshot(threadId);
  }

  return threadWorkspacePaths.get(threadId);
}

export function hasThreadWorkspacePathOverride(threadId: string): boolean {
  ensureBaseSettingsLoaded();

  if (!threadWorkspacePathHasOverride.has(threadId)) {
    _refreshThreadWorkspacePathSnapshot(threadId);
  }

  return threadWorkspacePathHasOverride.has(threadId);
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

    if (Object.prototype.hasOwnProperty.call(value, "model_name")) {
      const threadModelName = contextValue.model_name;
      threadModelNames.set(threadId, threadModelName);
      saveThreadModelName(threadId, threadModelName);
    }

    if (Object.prototype.hasOwnProperty.call(value, "agent_name")) {
      const threadAgentName = contextValue.agent_name;
      threadAgentHasOverride.add(threadId);
      threadAgentNames.set(threadId, threadAgentName);
      saveThreadAgentName(threadId, threadAgentName);
    }

    if (Object.prototype.hasOwnProperty.call(value, "user_workspace_path")) {
      const threadWorkspacePath = contextValue.user_workspace_path;
      threadWorkspacePathHasOverride.add(threadId);
      threadWorkspacePaths.set(threadId, threadWorkspacePath);
      saveThreadWorkspacePath(threadId, threadWorkspacePath);
    }
  }

  emitChange();
}
