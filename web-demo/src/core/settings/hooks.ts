import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  DEFAULT_LOCAL_SETTINGS,
  applyThreadAgentOverride,
  applyThreadModelOverride,
  applyThreadWorkspaceIdOverride,
  applyThreadWorkspacePathOverride,
  type LocalSettings,
} from "./local";
import {
  getBaseSettingsSnapshot,
  getThreadAgentSnapshot,
  getThreadModelSnapshot,
  getThreadWorkspaceIdSnapshot,
  getThreadWorkspacePathSnapshot,
  hasThreadAgentOverride,
  hasThreadWorkspaceIdOverride,
  hasThreadWorkspacePathOverride,
  subscribe,
  updateLocalSettings,
  updateThreadSettings,
  type LocalSettingsSetter,
} from "./store";

export function useLocalSettings(): [LocalSettings, LocalSettingsSetter] {
  const settings = useSyncExternalStore(
    subscribe,
    getBaseSettingsSnapshot,
    () => DEFAULT_LOCAL_SETTINGS,
  );

  const setSettings = useCallback<LocalSettingsSetter>((key, value) => {
    updateLocalSettings(key, value);
  }, []);

  return [settings, setSettings];
}

export function useThreadSettings(
  threadId: string,
): [LocalSettings, LocalSettingsSetter] {
  const baseSettings = useSyncExternalStore(
    subscribe,
    getBaseSettingsSnapshot,
    () => DEFAULT_LOCAL_SETTINGS,
  );

  const threadModelName = useSyncExternalStore(
    subscribe,
    () => getThreadModelSnapshot(threadId),
    () => undefined,
  );

  const threadAgentName = useSyncExternalStore(
    subscribe,
    () => getThreadAgentSnapshot(threadId),
    () => undefined,
  );

  const threadHasAgentOverride = useSyncExternalStore(
    subscribe,
    () => hasThreadAgentOverride(threadId),
    () => false,
  );

  const threadWorkspacePath = useSyncExternalStore(
    subscribe,
    () => getThreadWorkspacePathSnapshot(threadId),
    () => undefined,
  );

  const threadHasWorkspacePathOverride = useSyncExternalStore(
    subscribe,
    () => hasThreadWorkspacePathOverride(threadId),
    () => false,
  );

  const threadWorkspaceId = useSyncExternalStore(
    subscribe,
    () => getThreadWorkspaceIdSnapshot(threadId),
    () => undefined,
  );

  const threadHasWorkspaceIdOverride = useSyncExternalStore(
    subscribe,
    () => hasThreadWorkspaceIdOverride(threadId),
    () => false,
  );

  const settings = useMemo(
    () => {
      let result = applyThreadModelOverride(baseSettings, threadModelName);
      result = applyThreadAgentOverride(
        result,
        threadAgentName,
        threadHasAgentOverride,
      );
      result = applyThreadWorkspacePathOverride(
        result,
        threadWorkspacePath,
        threadHasWorkspacePathOverride,
      );
      result = applyThreadWorkspaceIdOverride(
        result,
        threadWorkspaceId,
        threadHasWorkspaceIdOverride,
      );
      return result;
    },
    [
      baseSettings,
      threadModelName,
      threadAgentName,
      threadHasAgentOverride,
      threadWorkspacePath,
      threadHasWorkspacePathOverride,
      threadWorkspaceId,
      threadHasWorkspaceIdOverride,
    ],
  );

  const setSettings = useCallback<LocalSettingsSetter>(
    (key, value) => {
      updateThreadSettings(threadId, key, value);
    },
    [threadId],
  );

  return [settings, setSettings];
}
