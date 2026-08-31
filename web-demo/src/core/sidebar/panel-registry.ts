import type { FileEntryLike, SidebarPanelSpec } from "./protocol";

class SidebarPanelRegistry {
  private readonly byId = new Map<string, SidebarPanelSpec>();
  /** Sorted snapshot, recomputed on mutation — stable between mutations so
   * useSyncExternalStore can rely on referential equality. */
  private cachedList: readonly SidebarPanelSpec[] = [];
  private readonly listeners = new Set<() => void>();

  register<P>(spec: SidebarPanelSpec<P>): () => void {
    if (this.byId.has(spec.id)) {
      throw new Error(`SidebarPanel "${spec.id}" already registered`);
    }
    this.byId.set(spec.id, spec as SidebarPanelSpec);
    this.invalidate();
    return () => this.unregister(spec.id);
  }

  unregister(id: string): boolean {
    const removed = this.byId.delete(id);
    if (removed) this.invalidate();
    return removed;
  }

  list(): readonly SidebarPanelSpec[] {
    return this.cachedList;
  }

  get(id: string): SidebarPanelSpec | undefined {
    return this.byId.get(id);
  }

  matchFileViewer(entry: FileEntryLike): SidebarPanelSpec | undefined {
    const lower = entry.name.toLowerCase();
    for (const spec of this.byId.values()) {
      const fv = spec.fileViewer;
      if (!fv) continue;
      if (fv.match?.(entry)) return spec;
      if (fv.exts.some((ext) => lower.endsWith(ext))) return spec;
    }
    return undefined;
  }

  /** Mutation subscription (H4: host dock reactivity). Additive — the
   * plugin-facing register/unregister contract is unchanged. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private invalidate(): void {
    this.cachedList = [...this.byId.values()].sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100),
    );
    for (const listener of this.listeners) listener();
  }
}

export const sidebarPanelRegistry = new SidebarPanelRegistry();
