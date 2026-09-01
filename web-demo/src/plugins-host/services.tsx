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
function PluginMountBoundary({
  mount,
  unmount,
}: {
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
    render:
      spec.render ??
      ((props) => (
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

/**
 * DSH ISessions soft-parity: git-panel-style plugins probe
 * ctx.get('sessions').list.getSnapshot() for the active session cwd.
 * The host UI keeps the active thread id current via setCurrentThread;
 * cwd stays null until H2 bridges thread -> host workspace path (the
 * plugins' own cwd-override UI covers manual selection meanwhile).
 */
let currentThread: string | null = null;

/** thread id -> host workspace path (resolved via the files API). */
const cwdByThread = new Map<string, string>();

export function setCurrentThread(threadId: string | null): void {
  currentThread = threadId;
  if (threadId && !cwdByThread.has(threadId)) {
    // H2 bridge step: resolve the host workspace path once per thread so
    // plugin server halves (git snapshot etc.) operate on the right tree.
    void fetch(
      `/api/files/workspace-path?thread_id=${encodeURIComponent(threadId)}`,
      { credentials: "include" },
    )
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((body: { path: string }) => {
        cwdByThread.set(threadId, body.path);
      })
      .catch(() => {
        /* stays absent; plugins see a null cwd and degrade */
      });
  }
}

registerPluginService("sessions", {
  list: {
    getSnapshot: () => ({
      current: currentThread,
      byId: Object.fromEntries(
        currentThread
          ? [[currentThread, { cwd: cwdByThread.get(currentThread) ?? null }]]
          : [],
      ),
    }),
  },
  /**
   * Per-session service scope (H4-d slice 1): T3 plugins resolve
   * session-scoped remotes via sessions.scope(id).get("remote.<pkg>").
   * The typert HTTP transport is slice 2 — mounted remotes are tracked,
   * unresolved lookups degrade to undefined (plugins handle absence).
   */
  scope: (_sessionId: string) => ({
    get: (name: string) => {
      if (name.startsWith("remote.")) {
        return serviceRemotes.get(name.slice("remote.".length));
      }
      return undefined;
    },
  }),
});

/** Mounted typert remote clients by package name (dsh-api-remotes face). */
const mountedRemotes = new Map<string, unknown>();
/** service key ("fileReview") -> method stubs, filled from descriptors. */
const serviceRemotes = new Map<
  string,
  Record<string, (request?: unknown) => Promise<unknown>>
>();

registerPluginService("remote", {
  /**
   * Mount a typert remote client descriptor {package, descriptors} and
   * build HTTP stubs against the runtime typert route (H4-d slice 2):
   * POST /qilin-plugins/typert/<package> {service, method, sessionId,
   * request} -> {ok:true,value}|{ok:false,error:{message}}. Consumers
   * resolve per-session faces via sessions.scope(id).get("remote.<svc>").
   */
  $mount: async (descriptor: unknown): Promise<() => void> => {
    const desc = descriptor as {
      package?: string;
      descriptors?: ReadonlyArray<{ service?: string; method?: string }>;
    };
    const pkg = desc.package ?? "anon:" + String(mountedRemotes.size);
    mountedRemotes.set(pkg, descriptor);
    for (const inv of desc.descriptors ?? []) {
      if (typeof inv.service !== "string" || typeof inv.method !== "string")
        continue;
      let svc = serviceRemotes.get(inv.service);
      if (svc === undefined) {
        svc = {};
        serviceRemotes.set(inv.service, svc);
      }
      svc[inv.method] = async (request?: unknown) => {
        const res = await fetch(
          "/qilin-plugins/typert/service/" +
            encodeURIComponent(inv.service ?? ""),
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              service: inv.service,
              method: inv.method,
              sessionId: getCurrentThread() ?? undefined,
              request,
            }),
          },
        );
        const body = (await res.json().catch(() => null)) as {
          ok: boolean;
          value?: unknown;
          error?: { message?: string };
        } | null;
        if (body === null) {
          return {
            ok: false as const,
            error: { message: "bad typert envelope" },
          };
        }
        return body;
      };
    }
    return () => {
      if (mountedRemotes.get(pkg) === descriptor) mountedRemotes.delete(pkg);
    };
  },
});

/** Host-side accessors for the betterSidebar service (H4-c): the editor
 * viewer converts absolute plugin paths to thread-relative via the cwd
 * resolved here by the sessions bridge. */
export function getCurrentThread(): string | null {
  return currentThread;
}

export function peekThreadCwd(threadId: string): string | null {
  return cwdByThread.get(threadId) ?? null;
}
