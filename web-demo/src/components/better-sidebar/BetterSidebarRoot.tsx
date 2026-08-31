"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { sidebarPanelRegistry } from "@/core/sidebar/panel-registry";
import type { SidebarPanelApi, SidebarTabState } from "@/core/sidebar/protocol";
import { SidebarScopeProvider } from "@/core/sidebar/scope";
import { useSidebarTabs } from "@/core/sidebar/use-sidebar-tabs";

import TabBar from "./TabBar";
import { TabContent } from "./TabContent";

interface Props {
  threadId: string;
  open: boolean;
  onClose?: () => void;
}

const EMPTY_STATE: SidebarTabState = { tabs: [], active: null, split: "single" };

export function BetterSidebarRoot({ threadId, open }: Props) {
  const { data, save } = useSidebarTabs(threadId);
  const [local, setLocal] = useState<SidebarTabState | null>(null);
  const state = local ?? data ?? EMPTY_STATE;

  // Debounced persistence — 500ms after local state change.
  useEffect(() => {
    if (!local) return;
    const t = setTimeout(() => { void save(local); }, 500);
    return () => clearTimeout(t);
  }, [local, save]);

  const api = useMemo<SidebarPanelApi>(() => ({
    openTab: ({ panel, payload = {}, title }) => {
      const key = `${panel}:${Math.random().toString(36).slice(2, 9)}`;
      setLocal((s) => {
        const cur = s ?? EMPTY_STATE;
        return {
          ...cur,
          tabs: [...cur.tabs, { key, panel, title: title ?? panel, payload: payload as Record<string, unknown>, pinned: false, created_at: Date.now() / 1000 }],
          active: key,
        };
      });
    },
    closeSelf: () => undefined,
    toast: () => undefined,
  }), []);

  if (!open) return null;

  return (
    <SidebarScopeProvider scope={{ threadId }} api={api}>
      <BetterSidebarInner state={state} setLocal={setLocal} api={api} />
    </SidebarScopeProvider>
  );
}

function BetterSidebarInner({ state, setLocal, api }: {
  state: SidebarTabState;
  setLocal: React.Dispatch<React.SetStateAction<SidebarTabState | null>>;
  api: SidebarPanelApi;
}) {
  const onActivate = useCallback(
    (k: string) => setLocal((s) => (s ? { ...s, active: k } : s)),
    [setLocal],
  );
  const onClose = useCallback(
    (k: string) =>
      setLocal((s) => {
        if (!s) return s;
        const tabs = s.tabs.filter((t) => t.key !== k);
        const active = s.active === k ? (tabs.at(-1)?.key ?? null) : s.active;
        return { ...s, tabs, active };
      }),
    [setLocal],
  );
  const onChangePayload = useCallback(
    (next: Record<string, unknown>) =>
      setLocal((s) => {
        if (!s?.active) return s;
        return { ...s, tabs: s.tabs.map((t) => (t.key === s.active ? { ...t, payload: { ...t.payload, ...next } } : t)) };
      }),
    [setLocal],
  );
  const activeTab = state.tabs.find((t) => t.key === state.active);

  // Plugin-registered panels (id prefix "plugin:") surface as quick-open
  // chips — the H1 bridge between third-party scripts and the sidebar.
  // Re-read per render: the registry is mutated imperatively by plugin
  // scripts (cheap list() keeps freshly registered panels visible).
  const pluginPanels = sidebarPanelRegistry.list().filter((s) => s.id.startsWith("plugin:"));

  return (
    <div className="bg-background flex h-full w-full flex-col border-l">
      <TabBar state={state} onActivate={onActivate} onClose={onClose} />
      {pluginPanels.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1 text-xs">
          {pluginPanels.map((spec) => (
            <button
              key={spec.id}
              type="button"
              data-testid="plugin-panel-chip"
              className="rounded bg-muted px-1.5 py-0.5 hover:bg-muted/70"
              onClick={() =>
                api.openTab({
                  panel: spec.id,
                  title: typeof spec.title === "function" ? spec.title() : spec.title,
                })
              }
            >
              🧩 {typeof spec.title === "function" ? spec.title() : spec.title}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab && <TabContent tab={activeTab} onChangePayload={onChangePayload} />}
      </div>
    </div>
  );
}
