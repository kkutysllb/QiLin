"use client";
/**
 * DSH `betterSidebar` service parity (H4-c) — a pragmatic host-side
 * implementation of the DSH-better-sidebar client service contract
 * (dsh-plugins/DSH-better-sidebar/src/client/service.ts, plugin version
 * 0.12.0). Published as ctx.get("betterSidebar") so third-party plugins
 * work unmodified — kcoder-git-panel probes it for plan/file preview:
 * openTab({ type: "editor", title, path, id }).
 *
 * Semantics mapped onto the QiLin plugin dock:
 * - openTab editor seeds become dock tabs (dedupe: explicit id safety net,
 *   then the DSH editor convention of deduping by path);
 * - a content seed (path/url) auto-opens the dock drawer — DSH parity:
 *   "a CONTENT open must land in sight"; type-only opens never expand;
 * - registerFileViewer descriptors match by priority desc (detect with
 *   head bytes first, then exts, [] = catch-all);
 * - the built-in editor viewer reads text through the gateway files API
 *   (thread-workspace fenced; absolute plugin paths converted to
 *   thread-relative via the sessions service cwd).
 *
 * Deliberately stubbed until a consumer needs them (T3 territory):
 * the SidebarStore handed to tab components, the declarative settings
 * seam, and prefs (isTabEnabled/isViewerEnabled are always true).
 *
 * Deliberately dormant: the DSH panel-avoidance DOM protocol
 * ([data-dsh-better-sidebar] probing). The QiLin dock is a floating
 * overlay with no layout contention; simulating the attribute would wake
 * git-panel yield/restore obligations for nothing.
 */
import type { ReactNode } from "react";

import {
  getCurrentThread,
  peekThreadCwd,
  registerPluginService,
} from "./services";

/** DSH SessionScope (api.ts) — structural subset. */
export interface BsSessionScope {
  sessionId: string;
  cwd?: string;
  repoRoot?: string;
}

/** DSH SidebarTab (state.ts) — structural subset. */
export interface BsTab {
  id: string;
  type: string;
  title: string;
  path?: string;
  meta?: unknown;
}

/** DSH OpenTabSeed (service.ts). */
export interface BsOpenTabSeed {
  type: string;
  title?: string;
  path?: string;
  id?: string;
  url?: string;
  meta?: unknown;
}

export interface BsTabComponentProps {
  ctx: { get(name: string): unknown };
  /** DSH SidebarStore — stub until a T3 consumer needs it. */
  store: Record<string, never>;
  scope: BsSessionScope;
  tab: BsTab;
  visible: boolean;
}

export interface BsFileViewerProps {
  ctx: { get(name: string): unknown };
  /** DSH SidebarStore — stub until a T3 consumer needs it. */
  store: Record<string, never>;
  scope: BsSessionScope;
  path: string;
  title: string;
  viewerId: string;
  content?: string;
  truncated?: boolean;
  mediaUrl?: string;
  customData?: unknown;
}

export interface BsTabDescriptor {
  id: string;
  title: string | (() => string);
  order?: number;
  hidden?: boolean;
  /** Sugar for dedupeKey: () => id. */
  single?: boolean;
  dedupeKey?: (tab: BsTab) => string | undefined;
  createTab?: (state: unknown) => { tab: BsTab; patch?: unknown } | null;
  onOpen?: (tab: BsTab, scope: BsSessionScope) => void;
  onActivate?: (tab: BsTab, scope: BsSessionScope) => void;
  onClose?: (tab: BsTab, scope: BsSessionScope) => void;
  component: (props: BsTabComponentProps) => ReactNode;
}

export type BsFileFetchStrategy =
  | "none"
  | "fsRead"
  | "mediaUrl"
  | "custom"
  | "binary-download";

export interface BsFileViewerDescriptor {
  id: string;
  title?: string | (() => string);
  /** Lowercase extensions without leading dot; [] = catch-all. */
  exts: readonly string[];
  /** Higher wins; default 0 (DSH: catch-all code viewer uses -100). */
  priority?: number;
  fetchStrategy: BsFileFetchStrategy;
  detect?: (path: string, head: Uint8Array) => boolean;
  load?: (
    path: string,
    scope: BsSessionScope,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  component: (props: BsFileViewerProps) => ReactNode;
}

/** One open dock tab: a minted BsTab plus a stable instance key. */
export interface BsOpenTab extends BsTab {
  key: string;
}

interface BsSnapshot {
  readonly tabs: readonly BsOpenTab[];
  readonly activeKey: string | null;
  readonly drawerOpen: boolean;
  readonly registryVersion: number;
}

let keySeq = 0;
const openTabs: BsOpenTab[] = [];
let activeKey: string | null = null;
let drawerOpen = false;
const tabDescriptors = new Map<string, BsTabDescriptor>();
const viewers = new Map<string, BsFileViewerDescriptor>();

let snapshotVersion = 0;
let cached: BsSnapshot = {
  tabs: [],
  activeKey: null,
  drawerOpen: false,
  registryVersion: 0,
};
const listeners = new Set<() => void>();

function emit(): void {
  snapshotVersion += 1;
  cached = {
    tabs: [...openTabs],
    activeKey,
    drawerOpen,
    registryVersion: snapshotVersion,
  };
  for (const listener of listeners) listener();
}

export function subscribeBs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getBsSnapshot(): BsSnapshot {
  return cached;
}

export function setDrawerOpen(next: boolean): void {
  if (drawerOpen === next) return;
  drawerOpen = next;
  emit();
}

/** Activate one open tab (null = back to the host plugin panels view). */
export function activateBs(key: string | null): void {
  if (activeKey === key) return;
  activeKey = key;
  emit();
}

function scopeNow(): BsSessionScope {
  const sessionId = getCurrentThread();
  return {
    sessionId: sessionId ?? "",
    cwd: sessionId ? (peekThreadCwd(sessionId) ?? undefined) : undefined,
  };
}

function titleOf(t: string | (() => string)): string {
  return typeof t === "function" ? t() : t;
}

function baseName(p: string): string {
  const segs = p.split("/").filter(Boolean);
  return segs.at(-1) ?? p;
}

function fireLifecycle(
  phase: "onOpen" | "onActivate" | "onClose",
  tab: BsOpenTab,
): void {
  const cb = tabDescriptors.get(tab.type)?.[phase];
  if (cb === undefined) return;
  try {
    cb(tab, scopeNow());
  } catch (err) {
    console.error("[better-sidebar] " + phase + " failed:", err);
  }
}

function openTabImpl(seed: BsOpenTabSeed): void {
  const contentSeed = seed.path !== undefined || seed.url !== undefined;
  const desc = tabDescriptors.get(seed.type);
  let tab: BsTab | null = null;
  if (desc?.createTab !== undefined) {
    try {
      const minted = desc.createTab({});
      if (minted === null) return; // descriptor refused creation
      tab = { ...minted.tab };
    } catch (err) {
      console.error("[better-sidebar] createTab failed:", err);
      return;
    }
  } else if (desc !== undefined) {
    tab = {
      id: seed.id ?? seed.type,
      type: seed.type,
      title: seed.title ?? titleOf(desc.title),
      path: seed.path,
      meta: seed.meta,
    };
  } else {
    // No registered descriptor: the implicit editor tab (DSH builtin) —
    // the only service surface kcoder-git-panel consumes.
    const type =
      seed.path !== undefined || seed.type === "editor" ? "editor" : seed.type;
    tab = {
      id: seed.id ?? "editor:" + (seed.path ?? seed.type),
      type,
      title: seed.title ?? baseName(seed.path ?? seed.type),
      path: seed.path,
      meta: seed.meta,
    };
  }
  // Dedupe: explicit dedupeKey wins, then single (= id), then the DSH id
  // safety net; the implicit editor additionally dedupes by path.
  let existing: BsOpenTab | undefined;
  if (desc?.dedupeKey !== undefined) {
    const keyOf = desc.dedupeKey;
    existing = openTabs.find((t) => {
      try {
        const k = keyOf(t);
        return k !== undefined && k === keyOf(tab);
      } catch {
        return false;
      }
    });
  } else if (desc?.single === true) {
    existing = openTabs.find((t) => t.id === tab?.id);
  } else if (tab.type === "editor" && tab.path !== undefined) {
    existing = openTabs.find(
      (t) => t.type === "editor" && t.path === tab?.path,
    );
  } else {
    existing = openTabs.find((t) => t.id === tab?.id);
  }
  if (existing !== undefined) {
    activeKey = existing.key;
    if (contentSeed) drawerOpen = true;
    fireLifecycle("onActivate", existing);
    emit();
    return;
  }
  keySeq += 1;
  const open: BsOpenTab = { ...tab, key: tab.id + ":" + String(keySeq) };
  openTabs.push(open);
  activeKey = open.key;
  if (contentSeed) drawerOpen = true; // content must land in sight
  fireLifecycle("onOpen", open);
  emit();
}

function closeTabImpl(tabId: string): void {
  const idx = openTabs.findIndex((t) => t.id === tabId);
  if (idx < 0) return; // unknown id is a strict no-op (DSH parity)
  const gone = openTabs.splice(idx, 1)[0];
  if (gone === undefined) return;
  if (activeKey === gone.key) {
    activeKey = openTabs.at(-1)?.key ?? null;
  }
  fireLifecycle("onClose", gone);
  emit();
}

/**
 * The BetterSidebarService parity object. Consumers type it against the
 * DSH interface; unimplemented depth (store-aware flows, settings, prefs)
 * is documented at the module head.
 */
export const betterSidebarService = {
  registerTab(descriptor: BsTabDescriptor): () => void {
    tabDescriptors.set(descriptor.id, descriptor);
    emit();
    return () => {
      if (tabDescriptors.get(descriptor.id) === descriptor) {
        tabDescriptors.delete(descriptor.id);
        emit();
      }
    };
  },
  registerFileViewer(descriptor: BsFileViewerDescriptor): () => void {
    viewers.set(descriptor.id, descriptor);
    emit();
    return () => {
      if (viewers.get(descriptor.id) === descriptor) {
        viewers.delete(descriptor.id);
        emit();
      }
    };
  },
  getTabs(): readonly BsTabDescriptor[] {
    return [...tabDescriptors.values()];
  },
  getFileViewers(): readonly BsFileViewerDescriptor[] {
    return [...viewers.values()].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
  },
  getTab(id: string): BsTabDescriptor | undefined {
    return tabDescriptors.get(id);
  },
  isTabEnabled(_id: string): boolean {
    return true; // no prefs seam in the QiLin host yet
  },
  isViewerEnabled(_id: string): boolean {
    return true;
  },
  matchFileViewer(
    path: string,
    head?: Uint8Array,
  ): BsFileViewerDescriptor | undefined {
    const lower = path.toLowerCase();
    const sorted = [...viewers.values()].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    for (const v of sorted) {
      if (head !== undefined && v.detect !== undefined) {
        try {
          if (v.detect(path, head)) return v;
        } catch {
          /* a throwing detect skips the descriptor */
        }
      }
      if (
        v.exts.length === 0 ||
        v.exts.some((ext) => lower.endsWith("." + ext.toLowerCase()))
      ) {
        return v;
      }
    }
    return undefined;
  },
  openTab(seed: BsOpenTabSeed): void {
    openTabImpl(seed);
  },
  closeTab(tabId: string): void {
    closeTabImpl(tabId);
  },
  subscribe(listener: () => void): () => void {
    return subscribeBs(listener);
  },
  version: "0.12.0" as const,
  features: ["openFile", "tabLifecycle", "updateTab"],
  getSnapshot(): {
    sessionId: string | undefined;
    state: undefined;
    prefs: Record<string, never>;
  } {
    return {
      sessionId: getCurrentThread() ?? undefined,
      state: undefined,
      prefs: {},
    };
  },
  subscribeState(listener: () => void): () => void {
    return subscribeBs(listener);
  },
  updateTab(
    tabId: string,
    patch: { title?: string; path?: string; meta?: unknown },
  ): void {
    const t = openTabs.find((x) => x.id === tabId);
    if (t === undefined) return; // missing id is a no-op (DSH parity)
    if (patch.title !== undefined) t.title = patch.title;
    if (patch.path !== undefined) t.path = patch.path;
    if (patch.meta !== undefined) t.meta = patch.meta;
    emit();
  },
  activateTab(tabId: string): void {
    const t = openTabs.find((x) => x.id === tabId);
    if (t === undefined) return;
    activeKey = t.key;
    fireLifecycle("onActivate", t);
    emit();
  },
  openFile(_scope: BsSessionScope, path: string, title?: string): void {
    openTabImpl({ type: "editor", path, title: title ?? baseName(path) });
  },
};

registerPluginService("betterSidebar", betterSidebarService);

/** Normalize a plugin-supplied file path for the gateway files API
 * (thread-fenced, which takes thread-workspace-relative paths).
 * git-panel sends BOTH shapes: change rows carry git-relative paths
 * ("README.md") — DSH resolves those against the session cwd, which is
 * exactly what the files API does, so they pass through as-is; plan rows
 * carry absolute paths — relativized when under the thread workspace,
 * rejected (null) when outside it (e.g. a git worktree override). */
export function toThreadRelPath(
  cwd: string | null,
  filePath: string,
): string | null {
  if (!filePath.startsWith("/")) return filePath;
  if (cwd === null || cwd === "") return null;
  if (filePath === cwd) return ".";
  const prefix = cwd.endsWith("/") ? cwd : cwd + "/";
  return filePath.startsWith(prefix) ? filePath.slice(prefix.length) : null;
}

export function filesReadUrl(threadId: string, relPath: string): string {
  return (
    "/api/files/read?thread_id=" +
    encodeURIComponent(threadId) +
    "&path=" +
    encodeURIComponent(relPath)
  );
}

export function filesRawUrl(threadId: string, relPath: string): string {
  return (
    "/api/files/raw?thread_id=" +
    encodeURIComponent(threadId) +
    "&path=" +
    encodeURIComponent(relPath)
  );
}
