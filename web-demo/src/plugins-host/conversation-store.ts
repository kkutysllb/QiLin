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

/**
 * DSH uiConversation session-wide events (H5-d slice 2): Definitions
 * (file-review-tab) match synthesized conversation events and publish
 * per-turn Location data (key "fileReviewChanges") into the timeline.
 * The host synthesizes turn/start + tool/call + tool/result events from
 * the chat message stream (message-feed); the registry maintains each
 * definition's per-turn state and lands buildLocationData() output via
 * setTurnData. Definition calls are contained — a broken plugin never
 * breaks the host.
 */
export interface ConversationEvent {
  type: "turn/start" | "tool/call" | "tool/result";
  /** DSH surface operation; the file-review match requires "append". */
  surfaceOp?: "append";
  data: {
    turn: string;
    name?: string;
    /** JSON string of the tool-call arguments (DSH contract). */
    arguments?: string;
    callId?: string;
    message?: {
      content: { isError: boolean }[];
      source: { callId: string };
    };
  };
}

interface MatchResult {
  id: string;
  role: "start" | "update";
}

interface ConversationDefinition {
  match: (event: ConversationEvent) => MatchResult | null;
  start?: (context: unknown, match: { event: ConversationEvent }) => unknown;
  update?: (
    context: { state: unknown },
    match: { event: ConversationEvent },
  ) => unknown;
  buildLocationData?: (
    context: { state: unknown },
    scope: string,
  ) => { kind: string; turn: number; key: string; value: unknown } | null;
}

const definitions = new Set<ConversationDefinition>();
const defTurnStates = new Map<ConversationDefinition, Map<string, unknown>>();
const defSeenEvents = new Map<ConversationDefinition, Set<string>>();

function definitionEntry(definition: ConversationDefinition): {
  states: Map<string, unknown>;
  seen: Set<string>;
} {
  let states = defTurnStates.get(definition);
  if (states === undefined) {
    states = new Map();
    defTurnStates.set(definition, states);
  }
  let seen = defSeenEvents.get(definition);
  if (seen === undefined) {
    seen = new Set();
    defSeenEvents.set(definition, seen);
  }
  return { states, seen };
}

/** Bounded replay log: definitions registering mid-session (the plugin
 * polls uiConversation for up to 30s after script injection) receive the
 * full event history, matching DSH's session-wide semantics. */
const eventLog: { sessionId: string; event: ConversationEvent }[] = [];
const MAX_EVENT_LOG = 1000;

function runDefinitionEvent(
  definition: ConversationDefinition,
  sessionId: string,
  event: ConversationEvent,
): void {
  try {
    const match = definition.match(event);
    if (match === null) return;
    const turnKey = match.id;
    const stateKey = sessionId + "\u0000" + turnKey;
    const { states, seen } = definitionEntry(definition);
    // The chat re-derives messages on every stream tick — replaying the
    // same synthesized event must be a no-op (hunks would duplicate).
    const eventId =
      event.type === "turn/start"
        ? "start"
        : event.type + ":" + (event.data.callId ?? "");
    const dedupeKey = stateKey + ":" + eventId;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    if (match.role === "start") {
      states.set(stateKey, definition.start?.({}, { event }) ?? {});
      return;
    }
    const state = states.get(stateKey);
    if (state === undefined) return; // update before start — drop
    const next = definition.update?.({ state: state }, { event }) ?? state;
    states.set(stateKey, next);
    const data = definition.buildLocationData?.({ state: next }, "turn");
    if (data !== null && data !== undefined && typeof data.key === "string") {
      setTurnData(sessionId, turnKey, data.key, data.value, "closed");
    }
  } catch (err) {
    console.error("[uiConversation] definition dispatch failed:", err);
  }
}

/** Feed one synthesized conversation event to every registered Definition. */
export function dispatchConversationEvent(
  sessionId: string,
  event: ConversationEvent,
): void {
  eventLog.push({ sessionId, event });
  if (eventLog.length > MAX_EVENT_LOG) eventLog.shift();
  for (const definition of definitions) {
    runDefinitionEvent(definition, sessionId, event);
  }
}

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
  /** DSH events registry: register(definition) -> disposer. */
  events: {
    register(definition: ConversationDefinition): () => void {
      if (
        definition === null ||
        typeof definition !== "object" ||
        typeof definition.match !== "function"
      ) {
        return () => {
          /* malformed register arguments are a no-op */
        };
      }
      definitions.add(definition);
      // Session-wide semantics: a definition registering after events
      // already flowed receives the bounded replay log (dedupe guards
      // make replays idempotent).
      for (const entry of eventLog) {
        runDefinitionEvent(definition, entry.sessionId, entry.event);
      }
      return () => {
        definitions.delete(definition);
        defTurnStates.delete(definition);
        defSeenEvents.delete(definition);
      };
    },
  },
};

registerPluginService("uiConversation", uiConversationService);
