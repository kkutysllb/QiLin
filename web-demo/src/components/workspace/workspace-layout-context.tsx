"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const RIGHT_PANEL_KEY = "kworks.workspace.rightPanelOpen";
const RIGHT_PANEL_WIDTH_KEY = "kworks.workspace.rightPanelWidth";
const HISTORY_KEY = "kworks.workspace.historyCollapsed";
const SECTIONS_KEY = "kworks.workspace.panelSections";

const RIGHT_PANEL_MIN_WIDTH = 280;
const RIGHT_PANEL_MAX_WIDTH = 520;
const RIGHT_PANEL_DEFAULT_WIDTH = 360;

export type PanelSectionId =
  | "todos"
  | "subagents"
  | "resources"
  | "artifacts"
  | "workspaceChanges";

/** 设置页可用的 section id，与 SettingsView 内部保持一致。 */
export type SettingsSectionId =
  | "general"
  | "models"
  | "memorySummary"
  | "tokenUsageBudget"
  | "mcp"
  | "toolsSandbox"
  | "webTools"
  | "uploads"
  | "dataSources"
  | "dataPersistence"
  | "skillModels"
  | "skill"
  | "agents"
  | "subagents";

interface WorkspaceLayoutValue {
  rightPanelOpen: boolean;
  toggleRightPanel: () => void;
  setRightPanelOpen: (open: boolean) => void;
  rightPanelWidth: number;
  setRightPanelWidth: (width: number) => void;
  historyCollapsed: boolean;
  toggleHistory: () => void;
  isSectionCollapsed: (id: PanelSectionId) => boolean;
  toggleSection: (id: PanelSectionId) => void;
  /** 设置全屏视图状态。 */
  settingsOpen: boolean;
  settingsSection: SettingsSectionId;
  openSettings: (section?: SettingsSectionId) => void;
  closeSettings: () => void;
}

const WorkspaceLayoutContext = createContext<WorkspaceLayoutValue | undefined>(
  undefined,
);

function readBoolean(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}

function readSections(): Record<PanelSectionId, boolean> {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<
        Record<PanelSectionId, boolean>
      >;
      return {
        todos: parsed.todos ?? false,
        subagents: parsed.subagents ?? false,
        resources: parsed.resources ?? false,
        artifacts: parsed.artifacts ?? false,
        workspaceChanges: parsed.workspaceChanges ?? false,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    todos: false,
    subagents: false,
    resources: false,
    artifacts: false,
    workspaceChanges: false,
  };
}

export function WorkspaceLayoutProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [rightPanelOpen, setRightPanelOpenState] = useState(false);
  const [rightPanelWidth, setRightPanelWidthState] = useState(RIGHT_PANEL_DEFAULT_WIDTH);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [sections, setSections] = useState<Record<PanelSectionId, boolean>>({
    todos: false,
    subagents: false,
    resources: false,
    artifacts: false,
    workspaceChanges: false,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSectionId>("general");

  const openSettings = useCallback((section?: SettingsSectionId) => {
    if (section) setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  // 初始化从 localStorage 恢复
  useEffect(() => {
    setRightPanelOpenState(readBoolean(RIGHT_PANEL_KEY, false));
    setHistoryCollapsed(readBoolean(HISTORY_KEY, false));
    setSections(readSections());
    try {
      const raw = localStorage.getItem(RIGHT_PANEL_WIDTH_KEY);
      if (raw) {
        const parsed = parseInt(raw, 10);
        if (!Number.isNaN(parsed)) {
          setRightPanelWidthState(
            Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, parsed)),
          );
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setRightPanelOpen = useCallback((open: boolean) => {
    setRightPanelOpenState(open);
    try {
      localStorage.setItem(RIGHT_PANEL_KEY, String(open));
    } catch {
      /* ignore */
    }
  }, []);

  const setRightPanelWidth = useCallback((width: number) => {
    const clamped = Math.min(
      RIGHT_PANEL_MAX_WIDTH,
      Math.max(RIGHT_PANEL_MIN_WIDTH, width),
    );
    setRightPanelWidthState(clamped);
    try {
      localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleRightPanel = useCallback(
    () => setRightPanelOpen(!rightPanelOpen),
    [rightPanelOpen, setRightPanelOpen],
  );

  const toggleHistory = useCallback(() => {
    setHistoryCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HISTORY_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const isSectionCollapsed = useCallback(
    (id: PanelSectionId) => sections[id] ?? false,
    [sections],
  );

  const toggleSection = useCallback((id: PanelSectionId) => {
    setSections((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? false) };
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      rightPanelOpen,
      toggleRightPanel,
      setRightPanelOpen,
      rightPanelWidth,
      setRightPanelWidth,
      historyCollapsed,
      toggleHistory,
      isSectionCollapsed,
      toggleSection,
      settingsOpen,
      settingsSection,
      openSettings,
      closeSettings,
    }),
    [
      rightPanelOpen,
      toggleRightPanel,
      setRightPanelOpen,
      rightPanelWidth,
      setRightPanelWidth,
      historyCollapsed,
      toggleHistory,
      isSectionCollapsed,
      toggleSection,
      settingsOpen,
      settingsSection,
      openSettings,
      closeSettings,
    ],
  );

  return (
    <WorkspaceLayoutContext.Provider value={value}>
      {children}
    </WorkspaceLayoutContext.Provider>
  );
}

export function useWorkspaceLayout() {
  const ctx = useContext(WorkspaceLayoutContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceLayout must be used within a WorkspaceLayoutProvider",
    );
  }
  return ctx;
}
