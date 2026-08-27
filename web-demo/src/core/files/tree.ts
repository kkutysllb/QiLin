import type { FileEntry } from "./api";

// Dirs first, then case-insensitive name order. Uses raw localeCompare (ICU
// root collation is case-insensitive at the primary level and orders lowercase
// before uppercase at the tertiary level), so ["A", "a"] sorts to ["a", "A"].
export function sortEntries(entries: readonly FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    const aDir = a.type === "dir" ? 0 : 1;
    const bDir = b.type === "dir" ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name.localeCompare(b.name);
  });
}

export function joinRel(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export function parentRel(rel: string): string {
  if (!rel) return "";
  const i = rel.lastIndexOf("/");
  return i < 0 ? "" : rel.slice(0, i);
}
