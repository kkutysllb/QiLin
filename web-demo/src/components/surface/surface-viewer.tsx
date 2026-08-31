"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Wire shape of the gateway's surface.open WS event (qilin.ports.protocol
 * SurfaceOpenEvent, camelCase aliases). readPath is a QiLin extension:
 * the workspace-relative path for filesystem targets, so this panel can
 * fetch content through the files API without knowing the workspace root.
 */
export interface SurfaceOpenEventWire {
  kind: "surface.open";
  sessionId: string;
  surface: "file" | "folder" | "url";
  target: string;
  title: string;
  readPath: string | null;
}

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

interface FileEntryWire {
  name: string;
  type: "file" | "dir" | "symlink" | "broken";
  size: number;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { credentials: "include", signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      detail?: string;
    } | null;
    throw new Error(body?.error?.message ?? body?.detail ?? `request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function OutsideWorkspaceCard({ event }: { event: SurfaceOpenEventWire }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
      <span className="font-mono text-foreground">{event.title}</span>
      <span className="max-w-full break-all font-mono">{event.target}</span>
      <span>this target lives outside the thread workspace, so its
        content is not fetchable here; the path above is the authoritative
        location.</span>
    </div>
  );
}

function FileSurface({ threadId, event }: { threadId: string; event: SurfaceOpenEventWire }) {
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    content?: string;
  }>({ loading: true });
  const isImage = IMAGE_EXTS.test(event.target);

  useEffect(() => {
    if (!event.readPath || isImage) return;
    const ctrl = new AbortController();
    setState({ loading: true });
    fetchJson<{ content: string }>(
      `/api/files/read?thread_id=${encodeURIComponent(threadId)}&path=${encodeURIComponent(event.readPath)}`,
      ctrl.signal,
    )
      .then((body) => setState({ loading: false, content: body.content }))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setState({ loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => ctrl.abort();
  }, [threadId, event.readPath, event.target, isImage]);

  if (!event.readPath) return <OutsideWorkspaceCard event={event} />;
  if (isImage) {
    const raw = `/api/files/raw?thread_id=${encodeURIComponent(threadId)}&path=${encodeURIComponent(event.readPath)}`;
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto p-2">
        { }
        <img src={raw} alt={event.title} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }
  if (state.loading) {
    return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">loading…</div>;
  }
  if (state.error) {
    return <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-destructive">{state.error}</div>;
  }
  return (
    <pre
      data-testid="surface-content"
      className="flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs"
    >
      {state.content}
    </pre>
  );
}

function FolderSurface({ threadId, event }: { threadId: string; event: SurfaceOpenEventWire }) {
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    entries?: FileEntryWire[];
  }>({ loading: true });

  useEffect(() => {
    if (!event.readPath) return;
    const ctrl = new AbortController();
    setState({ loading: true });
    fetchJson<{ entries: FileEntryWire[] }>(
      `/api/files/list?thread_id=${encodeURIComponent(threadId)}&path=${encodeURIComponent(event.readPath)}`,
      ctrl.signal,
    )
      .then((body) => setState({ loading: false, entries: body.entries }))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setState({ loading: false, error: err instanceof Error ? err.message : String(err) });
      });
    return () => ctrl.abort();
  }, [threadId, event.readPath]);

  if (!event.readPath) return <OutsideWorkspaceCard event={event} />;
  if (state.loading) {
    return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">loading…</div>;
  }
  if (state.error) {
    return <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-destructive">{state.error}</div>;
  }
  return (
    <ul className="flex-1 overflow-auto p-2 text-xs">
      {(state.entries ?? []).map((entry) => (
        <li key={entry.name} className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted">
          <span className="truncate font-mono">
            {entry.type === "dir" ? "📁 " : "📄 "}
            {entry.name}
          </span>
          <span className="ml-2 shrink-0 text-muted-foreground">{formatSize(entry.size)}</span>
        </li>
      ))}
      {(state.entries ?? []).length === 0 && (
        <li className="p-2 text-muted-foreground">empty directory</li>
      )}
    </ul>
  );
}

function UrlSurface({ event }: { event: SurfaceOpenEventWire }) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center justify-between border-b px-2 py-1 text-[11px] text-muted-foreground">
        <span className="truncate font-mono">{event.target}</span>
        <a href={event.target} target="_blank" rel="noreferrer" className="shrink-0 underline hover:text-foreground">
          open in new window
        </a>
      </div>
      <iframe
        data-testid="surface-frame"
        src={event.target}
        title={event.title}
        sandbox="allow-scripts allow-forms allow-popups"
        className="min-h-0 flex-1 bg-white"
      />
    </div>
  );
}

/**
 * Session surface adapter: renders sidebar_open pushes that arrive over the
 * terminals/stream WS (file -> text/image viewer, folder -> listing,
 * url -> sandboxed frame). Mirrors the DSH sidebar panel semantics: newest
 * open takes focus; opens are deduped per target; dismissal is local.
 */
export function SurfaceViewer({
  threadId,
  events,
  className,
}: {
  threadId: string;
  events: SurfaceOpenEventWire[];
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const [closedTargets, setClosedTargets] = useState<ReadonlySet<string>>(new Set());

  const visible = useMemo(() => {
    const byTarget = new Map<string, SurfaceOpenEventWire>();
    for (const evt of events) byTarget.set(evt.target, evt); // newest wins
    return [...byTarget.values()].filter((evt) => !closedTargets.has(evt.target));
  }, [events, closedTargets]);

  // A brand-new open takes focus, like the DSH panel auto-attaching.
  useEffect(() => {
    setActive(events.length - 1);
  }, [events.length]);

  const current = visible.length > 0 ? visible[Math.min(active, visible.length - 1)] : null;

  return (
    <div className={className}>
      <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1 text-xs">
        {visible.map((evt) => (
          <button
            key={evt.target}
            type="button"
            data-testid="surface-tab"
            onClick={() => setActive(visible.indexOf(evt))}
            className={`group flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted ${
              current?.target === evt.target ? "bg-muted font-medium" : ""
            }`}
          >
            <span className="max-w-40 truncate">
              {evt.surface === "url" ? "🔗 " : evt.surface === "folder" ? "📁 " : "📄 "}
              {evt.title}
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label={`close surface ${evt.title}`}
              onClick={(e) => {
                e.stopPropagation();
                setClosedTargets((prev) => new Set(prev).add(evt.target));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  setClosedTargets((prev) => new Set(prev).add(evt.target));
                }
              }}
              className="hidden rounded px-0.5 text-muted-foreground group-hover:inline hover:text-foreground"
            >
              ×
            </span>
          </button>
        ))}
        {visible.length === 0 && (
          <span className="text-muted-foreground">surface</span>
        )}
      </div>
      {current ? (
        current.surface === "url" ? (
          <UrlSurface event={current} />
        ) : current.surface === "folder" ? (
          <FolderSurface threadId={threadId} event={current} />
        ) : (
          <FileSurface threadId={threadId} event={current} />
        )
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-xs text-muted-foreground">
          <span>no surfaces opened yet</span>
          <span>ask the model to sidebar_open a file, folder, or URL —
            opens made while this panel was detached are queued and appear
            on attach.</span>
        </div>
      )}
    </div>
  );
}
