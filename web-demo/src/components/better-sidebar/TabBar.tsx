"use client";
import { X } from "lucide-react";
import { useMemo, type FC } from "react";

import type { SidebarTabState } from "@/core/sidebar/protocol";

interface Props {
  state: SidebarTabState;
  onActivate: (key: string) => void;
  onClose: (key: string) => void;
}

const TabBar: FC<Props> = ({ state, onActivate, onClose }) => {
  const ordered = useMemo(() => [...state.tabs].sort((a, b) => a.created_at - b.created_at), [state.tabs]);
  return (
    <div className="flex h-9 items-center gap-1 overflow-x-auto border-b px-2 text-xs">
      {ordered.map((t) => (
        <div
          key={t.key}
          className={
            "flex items-center gap-1 rounded-md px-2 py-1 " +
            (state.active === t.key ? "bg-muted" : "hover:bg-muted/50")
          }
          onClick={() => onActivate(t.key)}
        >
          <span className="max-w-[160px] truncate">{t.title}</span>
          <button
            type="button"
            aria-label={`close ${t.title}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onClose(t.key); }}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {ordered.length === 0 && <span className="text-muted-foreground">no tabs open</span>}
    </div>
  );
};

export default TabBar;
