import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  DEFAULT_LOCAL_SETTINGS,
  applyThreadAgentOverride,
  applyThreadModelOverride,
  applyThreadWorkspacePathOverride,
  type LocalSettings,
} from "./local";
import {
  getBaseSettingsSnapshot,
  getThreadAgentSnapshot,
  getThreadModelSnapshot,
  getThreadWorkspacePathSnapshot,
  hasThreadAgentOverride,
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
      return result;
    },
    [
      baseSettings,
      threadModelName,
      threadAgentName,
      threadHasAgentOverride,
      threadWorkspacePath,
      threadHasWorkspacePathOverride,
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
