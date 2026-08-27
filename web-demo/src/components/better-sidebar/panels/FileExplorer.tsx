"use client";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, File as FileIcon, Folder } from "lucide-react";
import { useState, type FC } from "react";
import { listDir, type FileEntry } from "@/core/files/api";
import { sortEntries, joinRel, parentRel } from "@/core/files/tree";
import { useSidebarApi } from "@/core/sidebar/scope";
import { sidebarPanelRegistry } from "@/core/sidebar/panel-registry";
import type { SidebarPanelProps } from "@/core/sidebar/protocol";

interface Props {
  scope: { threadId: string };
  root?: string;
}

export const FileExplorerPanel: FC<Props> = ({ scope, root = "" }) => {
  const [open, setOpen] = useState<Set<string>>(new Set([root].filter(Boolean)));
  return (
    <div className="text-sm">
      <Breadcrumbs scope={scope} root={root} />
      <Tree scope={scope} path={root} open={open} setOpen={setOpen} depth={0} />
    </div>
  );
};

function Breadcrumbs({ scope, root }: { scope: { threadId: string }; root: string }) {
  const segs = root ? root.split("/") : [];
  return (
    <div className="text-muted-foreground flex items-center gap-1 px-2 py-1 text-xs">
      <span className="font-medium">{scope.threadId.slice(0, 8)}</span>
      {segs.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="size-3" />
          <span>{s}</span>
        </span>
      ))}
    </div>
  );
}

function Tree({
  scope, path, open, setOpen, depth,
}: {
  scope: { threadId: string };
  path: string;
  open: Set<string>;
  setOpen: (next: Set<string>) => void;
  depth: number;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["files", scope.threadId, path],
    queryFn: () => listDir(scope.threadId, path),
  });
  const api = useSidebarApi();

  const toggle = (p: string) => {
    const next = new Set(open);
    if (next.has(p)) next.delete(p); else next.add(p);
    setOpen(next);
  };

  if (isLoading || !data) return <div className="text-muted-foreground px-2 py-1 text-xs">loading…</div>;

  return (
    <ul className={depth === 0 ? "" : "pl-3"}>
      {sortEntries(data.entries).map((e) => {
        const childPath = joinPath(path, e.name);
        const isOpen = open.has(childPath);
        return (
          <li key={e.name}>
            <button
              type="button"
              onClick={() => {
                if (e.type === "dir") toggle(childPath);
                else openFile(api, scope.threadId, childPath);
              }}
              className="hover:bg-muted flex w-full items-center gap-1 px-2 py-1 text-left"
            >
              {e.type === "dir" ? (
                isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />
              ) : (
                <span className="w-3" />
              )}
              {e.type === "dir" ? <Folder className="text-amber-500 size-3.5" /> : <FileIcon className="text-muted-foreground size-3.5" />}
              <span className="truncate">{e.name}</span>
            </button>
            {e.type === "dir" && isOpen && (
              <Tree scope={scope} path={childPath} open={open} setOpen={setOpen} depth={depth + 1} />
            )}
          </li>
        );
      })}
      {data.parent !== null && (
        <li>
          <button
            type="button"
            onClick={() => {
              const next = new Set(open);
              next.delete(parentRel(path));
              setOpen(next);
            }}
            className="text-muted-foreground px-2 py-1 text-xs italic"
          >
            .. (up)
          </button>
        </li>
      )}
    </ul>
  );
}

function joinPath(parent: string, child: string): string {
  return joinRel(parent, child);
}

function openFile(api: SidebarPanelProps["api"], threadId: string, path: string) {
  // Open the matched viewer panel as a new tab.
  void threadId;
  const fakeEntry: FileEntry = { name: path.split("/").pop() ?? path, type: "file", size: 0, mtime: 0, mime: null };
  const spec = sidebarPanelRegistry.matchFileViewer(fakeEntry);
  api.openTab({
    panel: spec?.id ?? "qilin:files",
    payload: { path },
    title: fakeEntry.name,
  });
}
