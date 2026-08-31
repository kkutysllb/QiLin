"use client";

import type { NextPage } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { SurfaceViewer, type SurfaceOpenEventWire } from "@/components/surface/surface-viewer";
import { TerminalPanel } from "@/components/terminal/terminal-panel";

const LAST_THREAD_KEY = "qilin.terminal.lastThread";

function TerminalInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadParam = searchParams.get("thread") ?? "";
  const [threadId, setThreadId] = useState<string>(threadParam);
  const [draft, setDraft] = useState(threadParam);
  const [surfaceEvents, setSurfaceEvents] = useState<SurfaceOpenEventWire[]>([]);

  const handleSurfaceEvent = useCallback((evt: SurfaceOpenEventWire) => {
    // Bounded history; the viewer dedupes per target (newest wins).
    setSurfaceEvents((prev) => [...prev.slice(-19), evt]);
  }, []);

  useEffect(() => {
    setSurfaceEvents([]); // surfaces are per-thread session state
    if (threadParam) {
      setThreadId(threadParam);
      try {
        localStorage.setItem(LAST_THREAD_KEY, threadParam);
      } catch {
        /* private mode */
      }
      return;
    }
    try {
      const last = localStorage.getItem(LAST_THREAD_KEY);
      if (last) setThreadId(last);
    } catch {
      /* private mode */
    }
  }, [threadParam]);

  const open = useCallback(
    (id: string) => {
      const trimmed = id.trim();
      if (!trimmed) return;
      router.push(`/workspace/terminal?thread=${encodeURIComponent(trimmed)}`);
    },
    [router],
  );

  return (
    <div className="flex h-dvh flex-col bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <span className="text-muted-foreground">thread:</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") open(draft);
          }}
          placeholder="paste a thread id…"
          className="w-72 rounded-md border bg-transparent px-2 py-1 font-mono"
        />
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-muted"
          onClick={() => open(draft)}
        >
          open
        </button>
        {threadId && (
          <span className="ml-auto text-muted-foreground">
            attached: <span className="font-mono">{threadId}</span>
          </span>
        )}
      </div>
      {threadId ? (
        <div className="flex min-h-0 flex-1">
          <TerminalPanel
            key={threadId}
            threadId={threadId}
            onSurfaceEvent={handleSurfaceEvent}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          />
          <SurfaceViewer
            key={`surface-${threadId}`}
            threadId={threadId}
            events={surfaceEvents}
            className="hidden w-[420px] shrink-0 flex-col border-l lg:flex"
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          paste a thread id above to attach a terminal
        </div>
      )}
    </div>
  );
}

const TerminalPage: NextPage = () => (
  <Suspense fallback={<div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">loading…</div>}>
    <TerminalInner />
  </Suspense>
);

export default TerminalPage;
