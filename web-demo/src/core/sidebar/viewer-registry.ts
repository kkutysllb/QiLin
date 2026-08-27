import type { FileEntryLike, FileViewerSpec } from "./protocol";

class FileViewerRegistry {
  private readonly byId = new Map<string, FileViewerSpec>();
  register(spec: FileViewerSpec): () => void {
    if (this.byId.has(spec.id)) throw new Error(`FileViewer "${spec.id}" already registered`);
    this.byId.set(spec.id, spec);
    return () => this.unregister(spec.id);
  }
  unregister(id: string): boolean { return this.byId.delete(id); }
  list(): readonly FileViewerSpec[] { return [...this.byId.values()]; }
  matchExt(name: string): FileViewerSpec | undefined {
    const lower = name.toLowerCase();
    return [...this.byId.values()].find((v) => v.exts.some((e) => lower.endsWith(e)));
  }
  match(entry: FileEntryLike, head?: string): FileViewerSpec | undefined {
    for (const v of this.byId.values()) if (v.match?.(entry, head)) return v;
    return this.matchExt(entry.name);
  }
}

export const fileViewerRegistry = new FileViewerRegistry();
