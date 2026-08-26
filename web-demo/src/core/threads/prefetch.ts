/**
 * Prefetch a thread's state into the runtime snapshot cache.
 *
 * Called on sidebar link hover/focus so that when the user clicks to switch
 * threads, the cache-bridge in `useThreadStream` can instantly display the
 * prefetched messages — skipping the skeleton-screen flash that would
 * otherwise appear while the SDK's `useStream` reconnects.
 *
 * The cache is populated via `publishThreadRuntimeSnapshot`, the same store
 * that `useThreadStream` reads from on remount/thread-switch (see
 * `hooks.ts:991-1000`). By writing here *before* navigation, the
 * `inReconnectTransition` bridge has data to show immediately.
 */

import type { Message } from "@langchain/langgraph-sdk";

import { getAPIClient } from "@/core/api";
import {
  getThreadRuntimeSnapshot,
  publishThreadRuntimeSnapshot,
} from "@/core/threads/runtime-store";
import type { AgentThreadState } from "@/core/threads/types";

// Track in-flight prefetches so rapid mouseenter/focus events don't fire
// duplicate requests for the same thread.
const inflight = new Set<string>();

/**
 * Prefetch a thread's latest state and publish it to the runtime snapshot
 * cache. No-ops if:
 *   - the threadId is empty
 *   - a snapshot already exists (cache hit — avoid redundant fetch)
 *   - a prefetch for this thread is already in flight
 */
export async function prefetchThreadState(threadId: string): Promise<void> {
  if (!threadId || threadId === "new") return;

  // Cache hit: don't re-fetch if we already have a fresh snapshot.
  if (getThreadRuntimeSnapshot(threadId)) return;

  // Dedupe: if a fetch is already running for this thread, skip.
  if (inflight.has(threadId)) return;
  inflight.add(threadId);

  try {
    const client = getAPIClient();
    const state = await client.threads.getState<AgentThreadState>(threadId);
    const messages: Message[] = state.values?.messages ?? [];

    // Only cache when there are messages to show; an empty snapshot would
    // make the cache-bridge display a blank screen instead of the skeleton.
    if (messages.length === 0) return;

    publishThreadRuntimeSnapshot(threadId, {
      messages,
      values: state.values ?? ({} as AgentThreadState),
      isLoading: false,
      error: null,
    });
  } catch {
    // Prefetch is best-effort; if it fails the user still gets the
    // normal loading flow (skeleton → live data) on click.
  } finally {
    inflight.delete(threadId);
  }
}
