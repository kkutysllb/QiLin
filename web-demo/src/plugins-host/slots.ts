/**
 * DSH `slots` service parity (H4-d slice 1) — a named-slot contribution
 * registry. Plugins contribute to host mount points via
 *   ctx.slots.inject(name, () => ctx.slots.register(contribution, component?))
 * where the contribution carries { name, priority, registrant,
 * inject(sessionId) -> props bag } and either a React component (DSH
 * form, second register argument) or — QiLin host extension for
 * plain-script plugins — mount(el, props)/unmount DOM hooks.
 *
 * The chat UI renders "conversation.chat.turnTail" after each completed
 * assistant turn (see conversation-slots.tsx).
 */
import type { ReactNode } from "react";

import { registerPluginService } from "./services";

export interface SlotRenderProps {
  sessionId: string;
  turn?: string;
  bag: Record<string, unknown>;
}

/** DSH select owner currency: the claiming turn plus the closing seq. */
export interface SlotSelectOwner {
  turn: { data: Map<string, unknown> };
  seq: number;
}

export interface SlotContribution {
  name: string;
  /** Ascending sort; default 0. */
  priority?: number;
  registrant?: string;
  /** Locale namespace for the host-supplied t() (file-review-tab: "file-review"). */
  locale?: string;
  /** Claim the mount per turn (DSH turn-tail contract): a non-empty match
   * becomes the component's `matched` prop; null declines before mount. */
  select?: (owner: SlotSelectOwner) => string[] | null;
  /** Produce the props bag for one session (per-mount). */
  inject?: (sessionId: string) => unknown;
  /** DSH form: React component. */
  component?: (props: SlotRenderProps) => ReactNode;
  /** QiLin host extension: DOM mount for React-free plugin scripts. */
  mount?: (el: HTMLElement, props: SlotRenderProps) => void;
  unmount?: (el: HTMLElement) => void;
}

interface SlotEntry {
  key: string;
  contribution: SlotContribution;
}

const byName = new Map<string, SlotEntry[]>();
const listeners = new Set<() => void>();
let version = 0;
let keySeq = 0;

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeSlots(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapCache = new Map<
  string,
  { v: number; entries: readonly SlotEntry[] }
>();

/** Sorted (priority asc) entries of one slot — cached per registry
 * version so useSyncExternalStore can rely on referential equality. */
export function getSlotEntries(name: string): readonly SlotEntry[] {
  const cached = snapCache.get(name);
  if (cached?.v === version) return cached.entries;
  const entries = [...(byName.get(name) ?? [])].sort(
    (a, b) => (a.contribution.priority ?? 0) - (b.contribution.priority ?? 0),
  );
  snapCache.set(name, { v: version, entries });
  return entries;
}

const slotsService = {
  /**
   * Declare a contribution to a named slot; the factory creates it
   * (file-review-tab shape). Returns a disposer covering the factory
   * result. A throwing factory never breaks the host.
   */
  inject(name: string, factory: () => unknown, _label?: string): () => void {
    let dispose: (() => void) | undefined;
    try {
      dispose = factory() as (() => void) | undefined;
    } catch (err) {
      console.error("[slots] factory failed for " + name + ":", err);
    }
    return () => {
      try {
        dispose?.();
      } catch {
        /* dispose errors stay contained */
      }
    };
  },
  register(
    contribution: SlotContribution,
    component?: (props: SlotRenderProps) => ReactNode,
  ): () => void {
    const full: SlotContribution =
      component !== undefined ? { ...contribution, component } : contribution;
    keySeq += 1;
    const entry: SlotEntry = {
      key: full.name + ":" + (full.registrant ?? "anon") + ":" + String(keySeq),
      contribution: full,
    };
    const list = byName.get(full.name) ?? [];
    list.push(entry);
    byName.set(full.name, list);
    emit();
    return () => {
      const cur = byName.get(full.name);
      if (cur === undefined) return;
      const i = cur.indexOf(entry);
      if (i !== -1) {
        cur.splice(i, 1);
        if (cur.length === 0) byName.delete(full.name);
        emit();
      }
    };
  },
  list(name: string): readonly SlotContribution[] {
    return getSlotEntries(name).map((e) => e.contribution);
  },
  subscribe(listener: () => void): () => void {
    return subscribeSlots(listener);
  },
};

registerPluginService("slots", slotsService);
