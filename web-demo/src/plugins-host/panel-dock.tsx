"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { sidebarPanelRegistry } from "@/core/sidebar/panel-registry";
import type {
  SidebarPanelApi,
  SidebarPanelSpec,
} from "@/core/sidebar/protocol";
import { useActiveThreadId } from "@/hooks/use-active-thread";

import {
  activateBs,
  betterSidebarService,
  filesRawUrl,
  filesReadUrl,
  getBsSnapshot,
  setDrawerOpen,
  subscribeBs,
  toThreadRelPath,
  type BsFileViewerDescriptor,
  type BsOpenTab,
  type BsSessionScope,
  type BsTabDescriptor,
} from "./better-sidebar";
import { getPluginService, peekThreadCwd } from "./services";

/**
 * PluginPanelDock — host-side mount surface for plugin panels. Two sources
 * feed it:
 * - sidebarPanelRegistry ids prefixed "plugin:" (the qiLin.sidebar
 *   contract, hello-tab);
 * - betterSidebar service open tabs (the DSH contract, H4-c — git-panel
 *   plan/file preview opens editor tabs here).
 * The self-built Better Sidebar was retired in H4; the chrome is
 * host-minimal: a floating toggle next to the DSH titlebar anchor strip
 * opens a drawer listing everything as chips and mounting the active one.
 */

/** Host ctx shim handed to DSH-contract tab/viewer components. */
const HOST_CTX = { get: (name: string) => getPluginService(name) };

function usePluginPanels(): readonly SidebarPanelSpec[] {
  return useSyncExternalStore(
    (onChange) => sidebarPanelRegistry.subscribe(onChange),
    () => sidebarPanelRegistry.list(),
  );
}

function useBsSnapshot() {
  return useSyncExternalStore(subscribeBs, getBsSnapshot);
}

function panelTitle(spec: SidebarPanelSpec): string {
  return typeof spec.title === "function" ? spec.title() : spec.title;
}

function bsScope(threadId: string | null): BsSessionScope {
  return {
    sessionId: threadId ?? "",
    cwd: threadId ? (peekThreadCwd(threadId) ?? undefined) : undefined,
  };
}

type EditorLoad =
  | { kind: "loading" }
  | { kind: "text"; content: string }
  | { kind: "binary"; rawUrl: string }
  | { kind: "missing" }
  | { kind: "outside" }
  | { kind: "noThread" }
  | { kind: "error"; message: string };

const MAX_RENDER_LINES = 5000;

/** The built-in editor fallback: thread-fenced text read + line-numbered
 * view; binary/missing/outside-workspace degrade with honest notes. */
function BsEditorView({ tab }: { tab: BsOpenTab }) {
  const threadId = useActiveThreadId();
  const [state, setState] = useState<EditorLoad>({ kind: "loading" });
  useEffect(() => {
    if (tab.path === undefined) {
      setState({ kind: "error", message: "tab has no path seed" });
      return;
    }
    if (threadId === null) {
      setState({ kind: "noThread" });
      return;
    }
    const rel = toThreadRelPath(peekThreadCwd(threadId), tab.path);
    if (rel === null) {
      setState({ kind: "outside" });
      return;
    }
    const ctrl = new AbortController();
    setState({ kind: "loading" });
    fetch(filesReadUrl(threadId, rel), {
      credentials: "include",
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (r.status === 404) {
          setState({ kind: "missing" });
          return;
        }
        if (r.status === 400) {
          // gateway: binary file — /read refuses, /raw serves bytes
          setState({ kind: "binary", rawUrl: filesRawUrl(threadId, rel) });
          return;
        }
        if (!r.ok) {
          setState({ kind: "error", message: "HTTP " + String(r.status) });
          return;
        }
        const body = (await r.json()) as { content: string };
        setState({ kind: "text", content: body.content });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ kind: "error", message: String(err) });
      });
    return () => ctrl.abort();
  }, [threadId, tab.path]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col text-xs">
      <div className="text-muted-foreground truncate border-b px-2 py-1">
        {tab.path ?? tab.id}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {state.kind === "loading" && (
          <div className="text-muted-foreground p-2">加载中…</div>
        )}
        {state.kind === "noThread" && (
          <div className="text-muted-foreground p-2">
            无活跃线程 — 文件读取随线程工作区围栏解析。
          </div>
        )}
        {state.kind === "outside" && (
          <div className="text-muted-foreground p-2">
            文件位于线程工作区之外（如 git worktree
            覆盖路径），宿主文件围栏拒绝读取。
          </div>
        )}
        {state.kind === "missing" && (
          <div className="text-muted-foreground p-2">
            文件不存在（可能已被移动或删除）。
          </div>
        )}
        {state.kind === "binary" && (
          <div className="text-muted-foreground space-y-1 p-2">
            <div>二进制文件，宿主编辑器不渲染内容。</div>
            <a
              className="text-foreground underline"
              href={state.rawUrl}
              target="_blank"
              rel="noreferrer"
            >
              打开原始文件 ↗
            </a>
          </div>
        )}
        {state.kind === "error" && (
          <div className="text-destructive p-2">{state.message}</div>
        )}
        {state.kind === "text" && <TextWithLines content={state.content} />}
      </div>
    </div>
  );
}

function TextWithLines({ content }: { content: string }) {
  const lines = content.split("\n");
  const shown = lines.slice(0, MAX_RENDER_LINES);
  return (
    <div className="font-mono">
      {shown.map((line, i) => (
        <div key={i} className="hover:bg-muted/40 flex">
          <span className="text-muted-foreground w-10 shrink-0 pr-2 text-right select-none">
            {i + 1}
          </span>
          <span className="break-all whitespace-pre-wrap">{line}</span>
        </div>
      ))}
      {lines.length > MAX_RENDER_LINES && (
        <div className="text-muted-foreground p-2">
          已截断渲染前 {MAX_RENDER_LINES} 行（共 {lines.length} 行）。
        </div>
      )}
    </div>
  );
}

/** Registered file-viewer host: fetches per fetchStrategy and feeds the
 * DSH FileViewerProps shape. */
function BsRegisteredViewer({
  tab,
  viewer,
  threadId,
}: {
  tab: BsOpenTab;
  viewer: BsFileViewerDescriptor;
  threadId: string | null;
}) {
  const [custom, setCustom] = useState<{ data: unknown; error: string | null }>(
    {
      data: null,
      error: null,
    },
  );
  const path = tab.path ?? "";
  const rel =
    threadId !== null && path !== ""
      ? toThreadRelPath(peekThreadCwd(threadId), path)
      : null;
  const [text, setText] = useState<{ content: string; error: string | null }>({
    content: "",
    error: null,
  });

  useEffect(() => {
    if (viewer.fetchStrategy !== "fsRead") return;
    if (threadId === null || rel === null) return;
    const ctrl = new AbortController();
    fetch(filesReadUrl(threadId, rel), {
      credentials: "include",
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) {
          setText({
            content: "",
            error: "read failed: HTTP " + String(r.status),
          });
          return;
        }
        const body = (await r.json()) as { content: string };
        setText({ content: body.content, error: null });
      })
      .catch(() => {
        /* aborted or failed — keep prior state */
      });
    return () => ctrl.abort();
  }, [viewer.fetchStrategy, threadId, rel]);

  useEffect(() => {
    if (viewer.fetchStrategy !== "custom" || viewer.load === undefined) return;
    const ctrl = new AbortController();
    setCustom({ data: null, error: null });
    viewer
      .load(path, bsScope(threadId), ctrl.signal)
      .then((data) => setCustom({ data, error: null }))
      .catch((err: unknown) => setCustom({ data: null, error: String(err) }));
    return () => ctrl.abort();
  }, [viewer, path, threadId]);

  const mediaUrl =
    rel !== null && threadId !== null ? filesRawUrl(threadId, rel) : undefined;
  if (viewer.fetchStrategy === "binary-download" && mediaUrl !== undefined) {
    return (
      <div className="text-muted-foreground space-y-1 p-2 text-xs">
        <div>二进制文件（viewer: {viewer.id}）。</div>
        <a className="text-foreground underline" href={mediaUrl} download>
          下载文件
        </a>
      </div>
    );
  }
  return (
    <>
      {viewer.component({
        ctx: HOST_CTX,
        store: {},
        scope: bsScope(threadId),
        path,
        title: tab.title,
        viewerId: viewer.id,
        content: viewer.fetchStrategy === "fsRead" ? text.content : undefined,
        truncated: false,
        mediaUrl,
        customData: custom.data,
      })}
      {text.error !== null && (
        <div className="text-destructive p-2 text-xs">{text.error}</div>
      )}
      {custom.error !== null && (
        <div className="text-destructive p-2 text-xs">{custom.error}</div>
      )}
    </>
  );
}

/** One betterSidebar open tab: registered tab component, registered file
 * viewer (matched by path), or the built-in editor fallback. */
function BsTabContent({ tab, visible }: { tab: BsOpenTab; visible: boolean }) {
  const threadId = useActiveThreadId();
  const tabDesc: BsTabDescriptor | undefined = betterSidebarService.getTab(
    tab.type,
  );
  if (tabDesc !== undefined) {
    return (
      <>
        {tabDesc.component({
          ctx: HOST_CTX,
          store: {},
          scope: bsScope(threadId),
          tab,
          visible,
        })}
      </>
    );
  }
  if (tab.type === "editor" && tab.path !== undefined) {
    const viewer = betterSidebarService.matchFileViewer(tab.path);
    if (viewer !== undefined) {
      return (
        <BsRegisteredViewer tab={tab} viewer={viewer} threadId={threadId} />
      );
    }
    return <BsEditorView tab={tab} />;
  }
  return (
    <div className="text-muted-foreground p-2 text-xs">
      未注册的面板类型: {tab.type}
    </div>
  );
}

export function PluginPanelDock() {
  const panels = usePluginPanels();
  const bs = useBsSnapshot();
  const pluginPanels = useMemo(
    () => panels.filter((s) => s.id.startsWith("plugin:")),
    [panels],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [payloads, setPayloads] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const threadId = useActiveThreadId();

  const activeSpec =
    pluginPanels.find((s) => s.id === activeId) ?? pluginPanels[0];
  const activeBs =
    bs.activeKey !== null
      ? bs.tabs.find((t) => t.key === bs.activeKey)
      : undefined;

  const api = useMemo<SidebarPanelApi>(
    () => ({
      openTab: ({ panel, payload }) => {
        setActiveId(panel);
        activateBs(null);
        if (payload !== undefined) {
          setPayloads((prev) => ({
            ...prev,
            [panel]: {
              ...(prev[panel] ?? {}),
              ...(payload as Record<string, unknown>),
            },
          }));
        }
        setDrawerOpen(true);
      },
      closeSelf: () => setDrawerOpen(false),
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

  if (pluginPanels.length === 0 && bs.tabs.length === 0) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Plugin panels"
        data-testid="plugin-dock-toggle"
        onClick={() => setDrawerOpen(!bs.drawerOpen)}
        className="bg-background hover:bg-muted fixed top-2 right-2 z-[2147483000] flex items-center gap-1 rounded-full border px-2 py-1 text-xs shadow-sm"
      >
        🧩 {pluginPanels.length + bs.tabs.length}
      </button>
      {bs.drawerOpen && (
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
              onClick={() => setDrawerOpen(false)}
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
                  activeBs === undefined && spec.id === activeSpec?.id
                    ? "bg-foreground/10 rounded px-1.5 py-0.5"
                    : "bg-muted hover:bg-muted/70 rounded px-1.5 py-0.5"
                }
                onClick={() => {
                  activateBs(null);
                  setActiveId(spec.id);
                }}
              >
                {panelTitle(spec)}
              </button>
            ))}
            {bs.tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                data-testid="bs-tab-chip"
                className={
                  t.key === activeBs?.key
                    ? "bg-foreground/10 max-w-[150px] truncate rounded px-1.5 py-0.5"
                    : "bg-muted hover:bg-muted/70 max-w-[150px] truncate rounded px-1.5 py-0.5"
                }
                title={t.title}
                onClick={() => activateBs(t.key)}
              >
                {t.type === "editor" ? "📄 " : ""}
                {t.title}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {activeBs !== undefined ? (
              <div key={activeBs.key} className="h-full w-full">
                <BsTabContent tab={activeBs} visible />
              </div>
            ) : (
              activeSpec && (
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
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}
