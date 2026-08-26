"use client";

import { useEffect, useState } from "react";

import { getBackendBaseURL } from "@/core/config";

export type BackendStatus = "connected" | "disconnected" | "checking";

const POLL_INTERVAL_MS = 3000;

/**
 * 轮询后端 /health 端点，返回连接状态。
 * 3s 间隔，避免侵入 SSE 流。
 */
export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    const base = getBackendBaseURL();

    async function check() {
      try {
        const res = await fetch(`${base}/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(2000),
        });
        if (!cancelled) setStatus(res.ok ? "connected" : "disconnected");
      } catch {
        if (!cancelled) setStatus("disconnected");
      }
    }

    void check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return status;
}
