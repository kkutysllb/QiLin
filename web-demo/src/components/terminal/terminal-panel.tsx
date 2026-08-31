"use client";

import { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "starting" | "ready" | "exited" | "error";

/**
 * Live terminal over the QiLin ports WS data plane (P4b).
 *
 * tmux semantics: the terminal OUTLIVES this component - unmount closes the
 * socket but not the pty; remount reattaches to the first non-exited
 * terminal of the thread (or creates one). Frames follow the gateway
 * contract: binary frames are "uuid\n" + raw bytes, control is JSON text
 * (subscribe / unsubscribe / resize / signal), events are JSON text
 * ("terminal.exited").
 */
export function TerminalPanel({ threadId, className }: { threadId: string; className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const uuidRef = useRef<string | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");

  const sendControl = useCallback((payload: Record<string, unknown>) => {
    wsRef.current?.send(JSON.stringify({ uuid: uuidRef.current ?? "", ...payload }));
  }, []);

  const spawnTerminal = useCallback(async (): Promise<string> => {
    // Reattach to the newest non-exited terminal of this thread, if any.
    const listRes = await fetch(`/api/threads/${threadId}/terminals`, { credentials: "include" });
    if (listRes.ok) {
      const list = (await listRes.json()) as Array<{ uuid: string; exited: boolean }>;
      const alive = [...list].reverse().find((t) => !t.exited);
      if (alive) return alive.uuid;
    }
    const res = await fetch(`/api/threads/${threadId}/terminals`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "terminal" }),
    });
    if (!res.ok) throw new Error(`terminal create failed: ${res.status}`);
    const created = (await res.json()) as { uuid: string };
    return created.uuid;
  }, [threadId]);

  useEffect(() => {
    if (!threadId) return;
    let disposed = false;
    let ws: WebSocket | null = null;
    const cleanups: Array<() => void> = [];

    void (async () => {
      try {
        setStatus("starting");
        const terminalUuid = await spawnTerminal();
        if (disposed) return;
        uuidRef.current = terminalUuid;

        const { Terminal } = await import("@xterm/xterm");
        const fit = new FitAddon();
        if (disposed) return;
        const term = new Terminal({
          cursorBlink: true,
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          convertEol: false,
        });
        termRef.current = term;
        fitRef.current = fit;
        const host = hostRef.current;
        if (!host) return;
        term.loadAddon(fit);
        term.open(host);
        try {
          fit.fit();
        } catch {
          /* container may be zero-sized at mount; resize observer retries */
        }

        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${proto}//${location.host}/api/threads/${threadId}/terminals/stream`);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
          ws?.send(JSON.stringify({ type: "subscribe", uuid: terminalUuid }));
          setStatus("ready");
          const { cols, rows } = term;
          ws?.send(JSON.stringify({ type: "resize", uuid: terminalUuid, cols, rows }));
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(event.data);
            const nl = bytes.indexOf(0x0a);
            if (nl === -1) return;
            const frameUuid = new TextDecoder().decode(bytes.slice(0, nl));
            if (frameUuid !== terminalUuid) return;
            term.write(bytes.slice(nl + 1));
            return;
          }
          try {
            const evt = JSON.parse(String(event.data)) as { type?: string; message?: string; exitCode?: number | null; exitSignal?: string | null };
            if (evt.type === "terminal.exited") {
              setStatus("exited");
              setMessage(
                evt.exitSignal
                  ? `killed by ${evt.exitSignal}`
                  : `exited with code ${evt.exitCode ?? "?"}`,
              );
            } else if (evt.type === "error") {
              setMessage(evt.message ?? "stream error");
            }
          } catch {
            /* non-JSON text frame - ignore */
          }
        };

        ws.onerror = () => {
          if (uuidRef.current === terminalUuid) setStatus("error");
        };
        ws.onclose = () => {
          if (uuidRef.current === terminalUuid && disposed === false) {
            setStatus((s) => (s === "exited" ? s : "error"));
            setMessage((m) => m || "stream closed");
          }
        };

        const onData = term.onData((data) => {
          if (ws?.readyState !== WebSocket.OPEN) return;
          const header = new TextEncoder().encode(`${terminalUuid}\n`);
          const payload = new TextEncoder().encode(data);
          const frame = new Uint8Array(header.length + payload.length);
          frame.set(header);
          frame.set(payload, header.length);
          ws.send(frame);
        });
        cleanups.push(() => onData.dispose());

        const resizeObserver = new ResizeObserver(() => {
          if (!fitRef.current || !uuidRef.current) return;
          try {
            fitRef.current.fit();
            const { cols, rows } = term;
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "resize", uuid: uuidRef.current, cols, rows }));
            }
          } catch {
            /* zero-size intermediate states */
          }
        });
        resizeObserver.observe(host);
        cleanups.push(() => resizeObserver.disconnect());
      } catch (err) {
        if (!disposed) {
          setStatus("error");
          setMessage(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      disposed = true;
      for (const cleanup of cleanups.reverse()) cleanup();
      if (ws && ws.readyState <= WebSocket.OPEN) {
        if (uuidRef.current) {
          try {
            ws.send(JSON.stringify({ type: "unsubscribe", uuid: uuidRef.current }));
          } catch {
            /* socket already closing */
          }
        }
        ws.close();
      }
      wsRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
      uuidRef.current = null;
    };
  }, [threadId, spawnTerminal]);

  const restart = useCallback(() => {
    // New pty, same socket contract: full remount via key change is the
    // simplest correct path (page passes key={attempt}).
    window.dispatchEvent(new CustomEvent("qilin-terminal-restart"));
  }, []);

  const sendSignal = useCallback(
    (signal: string) => {
      sendControl({ type: "signal", signal });
    },
    [sendControl],
  );

  return (
    <div className={className}>
      <div className="flex items-center justify-between border-b px-2 py-1 text-xs">
        <span className="text-muted-foreground">
          {threadId ? `terminal · ${threadId.slice(0, 12)}` : "terminal"}
        </span>
        <div className="flex items-center gap-1">
          {status === "ready" && (
            <>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 hover:bg-muted"
                onClick={() => sendSignal("SIGINT")}
                aria-label="send SIGINT"
              >
                Ctrl+C
              </button>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 hover:bg-muted"
                onClick={() => sendSignal("SIGKILL")}
                aria-label="send SIGKILL"
              >
                kill
              </button>
            </>
          )}
          <button
            type="button"
            className="rounded px-1.5 py-0.5 hover:bg-muted"
            onClick={restart}
            aria-label="restart terminal"
          >
            new
          </button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0 overflow-hidden p-1" />
        {(status === "exited" || status === "error" || status === "starting") && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs">
            <div className="flex flex-col items-center gap-2">
              <span className="text-muted-foreground">
                {status === "starting"
                  ? "starting terminal…"
                  : status === "exited"
                    ? `terminal ${message}`
                    : `error: ${message || "stream failed"}`}
              </span>
              {status !== "starting" && (
                <button
                  type="button"
                  className="rounded-md border px-2 py-1 hover:bg-muted"
                  onClick={restart}
                >
                  start a new terminal
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
