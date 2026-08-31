"use client";

import type { NextPage } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { TerminalPanel } from "@/components/terminal/terminal-panel";

const LAST_THREAD_KEY = "qilin.terminal.lastThread";

function TerminalInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadParam = searchParams.get("thread") ?? "";
  const [threadId, setThreadId] = useState<string>(threadParam);
  const [draft, setDraft] = useState(threadParam);

  useEffect(() => {
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
        <TerminalPanel key={threadId} threadId={threadId} className="flex min-h-0 flex-1 flex-col" />
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
