"use client";

import { useEffect, useState } from "react";

import { isDesktopBackendManagedMode } from "@/core/config";
import {
  getBackendStatus,
  type BackendStatus,
} from "@/core/desktop";

export function shouldShowBackendSplash(
  status: BackendStatus | null,
  desktop: boolean,
): boolean {
  if (!desktop) return false;
  return status?.status === "starting";
}

const STATUS_STYLES: Record<string, string> = {
  stopped: "bg-zinc-500/15 text-zinc-400 ring-zinc-500/30",
  starting: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  running: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  error: "bg-red-500/15 text-red-400 ring-red-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  stopped: "已停止",
  starting: "启动中",
  running: "运行中",
  error: "错误",
};

/**
 * Startup splash panel shown while the desktop shell initializes its services.
 *
 * Displays a single "service status" section that reflects the gateway's
 * current state. Auto-dismisses ~1s after the gateway reports "running".
 */
export function BackendSplashScreen() {
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [dots, setDots] = useState(0);
  // "loading" → services still starting; "fading" → all running, animating
  // out; "hidden" → unmounted.
  const [phase, setPhase] = useState<"loading" | "fading" | "hidden">(
    "loading",
  );

  // Poll backend status.
  useEffect(() => {
    if (!isDesktopBackendManagedMode()) return;

    let cancelled = false;
    const check = async () => {
      const s = await getBackendStatus();
      if (cancelled) return;
      setStatus(s);
    };

    void check();
    const interval = setInterval(() => void check(), 800);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // When the backend reports "running", begin the fade-out sequence.
  useEffect(() => {
    if (phase !== "loading") return;
    // Gateway is the only managed service, so its status is the signal.
    if (status?.status === "running") {
      // Small delay so the user sees the green “running” badge before fade.
      const timer = setTimeout(() => setPhase("fading"), 1000);
      return () => clearTimeout(timer);
    }
  }, [status, phase]);

  // Animate dots.
  useEffect(() => {
    const timer = setInterval(() => setDots((d) => (d + 1) % 4), 500);
    return () => clearInterval(timer);
  }, []);

  if (!shouldShowBackendSplash(status, isDesktopBackendManagedMode())) return null;
  if (phase === "hidden") return null;

  // Fading-out overlay: a blank background that animates to transparent.
  if (phase === "fading") {
    return <FadingOverlay onDone={() => setPhase("hidden")} />;
  }

  // In "loading" phase the panel is always visible — the phase only
  // transitions to "fading" once `status` reports "running" (see the
  // effect above). This avoids a race where the panel flickers off
  // before the fade-out animation starts.

  const hasError = status?.status === "error";
  const svcStatus = status?.status ?? "stopped";
  const svcPort = status?.port;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto p-6">
        {/* Header: logo + title */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-[#151527] shadow-lg">
            <svg viewBox="0 0 100 100" className="h-12 w-12">
              <defs>
                <linearGradient id="splashGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style={{ stopColor: "#FEF08A" }} />
                  <stop offset="42%" style={{ stopColor: "#FACC15" }} />
                  <stop offset="46%" style={{ stopColor: "#EAB308" }} />
                  <stop offset="54%" style={{ stopColor: "#4ADE80" }} />
                  <stop offset="100%" style={{ stopColor: "#16A34A" }} />
                </linearGradient>
              </defs>
              <g transform="rotate(-35, 50, 50)">
                <path
                  d="M 89,50 L 78,78 L 50,89 L 22,78 L 11,50 L 22,22 L 50,11 L 78,22 Z M 75,50 L 68,68 L 50,75 L 32,68 L 25,50 L 32,32 L 50,25 L 68,32 Z"
                  fill="url(#splashGrad)"
                  fillRule="evenodd"
                />
              </g>
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground">
              {hasError ? "启动遇到问题" : `正在启动 KWorks${".".repeat(dots)}`}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {hasError ? "请检查下方的服务状态" : "正在初始化后端服务"}
            </p>
          </div>
        </div>

        {/* Section 1: Service status */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              服务状态
            </h3>
            {!hasError && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div
              key="gateway"
              className="flex items-center justify-between gap-3 rounded-lg bg-background/40 px-3 py-2"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    Gateway
                  </span>
                  {svcPort != null && (
                    <span className="text-xs text-muted-foreground">
                      :{svcPort}
                    </span>
                  )}
                </div>
                {status?.error && (
                  <span className="truncate text-xs text-red-400">
                    {status.error}
                  </span>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                  STATUS_STYLES[svcStatus] ?? STATUS_STYLES.stopped
                } ${svcStatus === "starting" ? "animate-pulse" : ""}`}
              >
                {STATUS_LABELS[svcStatus] ?? svcStatus}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-screen overlay that fades from opaque to transparent, then calls
 * `onDone`. Uses `requestAnimationFrame` so the initial `opacity: 1` state
 * is painted before transitioning to 0 — otherwise the transition never fires.
 */
function FadingOverlay({ onDone }: { onDone: () => void }) {
  const [opacity, setOpacity] = useState(1);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpacity(0));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      className="bg-background fixed inset-0 z-[100] transition-opacity duration-700"
      style={{ opacity }}
      onTransitionEnd={onDone}
    />
  );
}
