"use client";
import { useEffect, useRef } from "react";

import { sidebarPanelRegistry } from "@/core/sidebar/panel-registry";
import type { SidebarPanelSpec } from "@/core/sidebar/protocol";

/**
 * Plugin service bridge — the QiLin-side equivalent of cordis service
 * injection. Plugins declare inject: ["qiLin.sidebar"] and the loader
 * hands the instance to apply(). Service names are the compatibility
 * contract; DSH-parity aliases can be added here later (H4) without
 * touching plugins.
 */

export interface PluginTabDescriptor {
  /** Unique panel id, e.g. "plugin:hello-tab:main". */
  id: string;
  title: string;
  order?: number;
  /**
   * DOM mount — plugins are plain scripts with no React; the bridge wraps
   * this in a host component that calls mount(el) on attach and
   * unmount(el) on detach. Mutually exclusive with render.
   */
  mount?: (el: HTMLElement) => void;
  unmount?: (el: HTMLElement) => void;
  /** React render form for host-side integrations (mutually exclusive with mount). */
  render?: SidebarPanelSpec["render"];
}

export interface QiLinSidebarService {
  registerTab(spec: PluginTabDescriptor): () => void;
}

const services = new Map<string, unknown>();

export function registerPluginService(name: string, svc: unknown): () => void {
  services.set(name, svc);
  return () => services.delete(name);
}

export function getPluginService(name: string): unknown {
  const svc = services.get(name);
  if (svc === undefined) {
    console.warn("[plugin-host] unknown service:", name);
  }
  return svc;
}

/** DOM-mount to React adapter (host-side; plugins stay React-free). */
function PluginMountBoundary({ mount, unmount }: {
  mount: (el: HTMLElement) => void;
  unmount?: (el: HTMLElement) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    mount(el);
    return () => unmount?.(el);
    // mount/unmount come from plugin scripts; stable per registered spec.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} className="h-full w-full overflow-auto p-2 text-xs" />;
}

function registerSidebarTab(spec: PluginTabDescriptor): () => void {
  const panelSpec: SidebarPanelSpec = {
    id: spec.id,
    title: spec.title,
    order: spec.order ?? 90,
    render: spec.render
      ?? ((props) => (
          <PluginMountBoundary
            mount={(el) => {
              // Surface the resolved thread scope for DOM-only plugins.
              el.dataset.threadId = props.scope.threadId;
              spec.mount?.(el);
            }}
            unmount={spec.unmount}
          />
        )),
  };
  if (sidebarPanelRegistry.get(spec.id)) {
    sidebarPanelRegistry.unregister(spec.id); // replace-on-reload
  }
  return sidebarPanelRegistry.register(panelSpec);
}

registerPluginService("qiLin.sidebar", {
  registerTab: registerSidebarTab,
} as QiLinSidebarService);
