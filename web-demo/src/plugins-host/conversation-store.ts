"use client";

import { registerPluginService } from "./services";
/**
 * uiConversation service parity (H5-d) — a per-thread conversation face the
 * way dsh-file-review-tab consumes it: binding(sessionId).target("chat")
 * returns { getSnapshot, subscribe }; the snapshot carries a timeline whose
 * turns hold per-turn data maps (the built-in "deliverables" turn data is
 * the one file-review reads: { produced: [{ path }] }).
 *
 * The QiLin chat UI (message-feed) records deliverables per completed
 * assistant turn; consumers derive per-turn file rows from it.
 */

interface TurnLocation {
  status: "open" | "closed";
  data: Map<string, unknown>;
}

interface Timeline {
  turns: Map<string, TurnLocation>;
  turnOrder: string[];
}

/**
 * Legacy windowed-snapshot shape, as dsh-file-review-tab's
 * resolveConversationStore adapter expects it: a timeline carrier keeps its
 * timeline only when `legacy` is non-null, and the legacy derive touches
 * turnEnds / nodes / runningCalls / partial. QiLin has no windowed legacy
 * source, so we publish an empty window.
 */
export interface LegacyWindow {
  turnEnds: Map<number, number>;
  nodes: readonly unknown[];
  runningCalls: readonly unknown[];
  partial: null;
}

export interface ConversationSnapshot {
  legacy: LegacyWindow;
  timeline: Timeline;
}

interface ThreadState {
  timeline: Timeline;
  cachedSnapshot?: ConversationSnapshot;
}

const threads = new Map<string, ThreadState>();
const listeners = new Set<() => void>();

function threadState(sessionId: string): ThreadState {
  let state = threads.get(sessionId);
  if (state === undefined) {
    state = { timeline: { turns: new Map(), turnOrder: [] } };
    threads.set(sessionId, state);
  }
  return state;
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Record one turn-data key for a thread's turn (upsert turn in order). */
export function setTurnData(
  sessionId: string,
  turnId: string,
  key: string,
  value: unknown,
  status: "open" | "closed" = "closed",
): void {
  const state = threadState(sessionId);
  let location = state.timeline.turns.get(turnId);
  if (location === undefined) {
    location = { status, data: new Map() };
    state.timeline.turns.set(turnId, location);
    state.timeline.turnOrder.push(turnId);
  }
  location.status = status;
  if (location.data.get(key) !== value) location.data.set(key, value);
  // Drop the cached snapshot so useSyncExternalStore consumers (plugin
  // changesStore, slot select gates) observe a new identity on mutation.
  state.cachedSnapshot = undefined;
  emit();
}

/** Snapshot for one thread — referentially stable between mutations. */
export function conversationSnapshot(sessionId: string): ConversationSnapshot {
  const state = threadState(sessionId);
  state.cachedSnapshot ??= {
    legacy: { turnEnds: new Map(), nodes: [], runningCalls: [], partial: null },
    timeline: state.timeline,
  };
  return state.cachedSnapshot;
}

export function subscribeConversation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The uiConversation service: binding(sessionId).target("chat") → source. */
export const uiConversationService = {
  binding(sessionId: string) {
    return {
      target(kind: string) {
        if (kind !== "chat") return undefined;
        return {
          getSnapshot: () => conversationSnapshot(sessionId),
          subscribe: (listener: () => void) => subscribeConversation(listener),
        };
      },
    };
  },
};

registerPluginService("uiConversation", uiConversationService);
