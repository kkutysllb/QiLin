"use client";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { sidebarPanelRegistry } from "@/core/sidebar/panel-registry";
import type {
  SidebarPanelApi,
  SidebarPanelSpec,
} from "@/core/sidebar/protocol";
import { useActiveThreadId } from "@/hooks/use-active-thread";

/**
 * PluginPanelDock — host-side mount surface for plugin-registered panels
 * (sidebarPanelRegistry ids prefixed "plugin:"). The self-built Better
 * Sidebar was retired in H4; the `qiLin.sidebar.registerTab` contract is
 * unchanged, only the chrome is host-minimal: a floating toggle next to
 * the DSH titlebar anchor strip opens a drawer listing plugin panels as
 * chips and mounting the active one.
 */

function usePluginPanels(): readonly SidebarPanelSpec[] {
  return useSyncExternalStore(
    (onChange) => sidebarPanelRegistry.subscribe(onChange),
    () => sidebarPanelRegistry.list(),
  );
}

function panelTitle(spec: SidebarPanelSpec): string {
  return typeof spec.title === "function" ? spec.title() : spec.title;
}

export function PluginPanelDock() {
  const panels = usePluginPanels();
  const pluginPanels = useMemo(
    () => panels.filter((s) => s.id.startsWith("plugin:")),
    [panels],
  );

  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [payloads, setPayloads] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const threadId = useActiveThreadId();

  const activeSpec =
    pluginPanels.find((s) => s.id === activeId) ?? pluginPanels[0];

  const api = useMemo<SidebarPanelApi>(
    () => ({
      openTab: ({ panel, payload }) => {
        setActiveId(panel);
        if (payload !== undefined) {
          setPayloads((prev) => ({
            ...prev,
            [panel]: {
              ...(prev[panel] ?? {}),
              ...(payload as Record<string, unknown>),
            },
          }));
        }
        setOpen(true);
      },
      closeSelf: () => setOpen(false),
      toast: (msg, tone) => (tone === "error" ? toast.error(msg) : toast(msg)),
    }),
    [],
  );

  const onPayloadChange = useCallback(
    (next: unknown) => {
      const id = activeSpec?.id;
      if (!id) return;
      setPayloads((prev) => ({
        ...prev,
        [id]: (next ?? {}) as Record<string, unknown>,
      }));
    },
    [activeSpec?.id],
  );

  if (pluginPanels.length === 0) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Plugin panels"
        data-testid="plugin-dock-toggle"
        onClick={() => setOpen((v) => !v)}
        className="bg-background hover:bg-muted fixed top-2 right-2 z-[2147483000] flex items-center gap-1 rounded-full border px-2 py-1 text-xs shadow-sm"
      >
        🧩 {pluginPanels.length}
      </button>
      {open && (
        <div
          data-testid="plugin-dock"
          className="bg-background fixed right-2 bottom-2 z-[2147482000] flex w-[380px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-lg border shadow-xl"
          style={{ top: 44 }}
        >
          <div className="flex items-center justify-between border-b px-2 py-1.5 text-xs font-medium">
            <span>🧩 插件面板</span>
            <button
              type="button"
              aria-label="Close plugin dock"
              data-testid="plugin-dock-close"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-1.5 py-0.5"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1 text-xs">
            {pluginPanels.map((spec) => (
              <button
                key={spec.id}
                type="button"
                data-testid="plugin-panel-chip"
                className={
                  spec.id === activeSpec?.id
                    ? "bg-foreground/10 rounded px-1.5 py-0.5"
                    : "bg-muted hover:bg-muted/70 rounded px-1.5 py-0.5"
                }
                onClick={() => setActiveId(spec.id)}
              >
                {panelTitle(spec)}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {activeSpec && (
              <div key={activeSpec.id} className="h-full w-full">
                {activeSpec.render({
                  scope: { threadId: threadId ?? "" },
                  payload:
                    payloads[activeSpec.id] ??
                    activeSpec.defaultPayload?.() ??
                    {},
                  onPayloadChange,
                  api,
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
