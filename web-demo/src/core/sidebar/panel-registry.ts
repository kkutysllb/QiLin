import type { FileEntryLike, SidebarPanelSpec } from "./protocol";

class SidebarPanelRegistry {
  private readonly byId = new Map<string, SidebarPanelSpec>();

  register<P>(spec: SidebarPanelSpec<P>): () => void {
    if (this.byId.has(spec.id)) {
      throw new Error(`SidebarPanel "${spec.id}" already registered`);
    }
    this.byId.set(spec.id, spec as SidebarPanelSpec);
    return () => this.unregister(spec.id);
  }

  unregister(id: string): boolean {
    return this.byId.delete(id);
  }

  list(): readonly SidebarPanelSpec[] {
    return [...this.byId.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
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
}

export const sidebarPanelRegistry = new SidebarPanelRegistry();
