"use client";

import { ChevronRightIcon, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import {
  type PanelSectionId,
  useWorkspaceLayout,
} from "../workspace-layout-context";

export function PanelSection({
  id,
  icon: Icon,
  title,
  count,
  children,
}: {
  id: PanelSectionId;
  icon: LucideIcon;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  const { isSectionCollapsed, toggleSection } = useWorkspaceLayout();
  const collapsed = isSectionCollapsed(id);

  return (
    <section className="border-b">
      <button
        type="button"
        onClick={() => toggleSection(id)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{title}</span>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {count}
          </span>
        )}
        <ChevronRightIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !collapsed && "rotate-90",
          )}
        />
      </button>
      {!collapsed && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}

export function PanelEmpty({ text }: { text: string }) {
  return (
    <p className="py-2 text-center text-xs text-muted-foreground">{text}</p>
  );
}
