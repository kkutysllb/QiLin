"use client";
import type { ReactNode } from "react";
import { sidebarPanelRegistry } from "./panel-registry";
import type { SidebarPanelProps } from "./protocol";
import { useSidebarApi, useSidebarScope } from "./scope";

export function PanelHost({
  panel, payload, onPayloadChange,
}: { panel: string; payload: unknown; onPayloadChange: (next: unknown) => void }): ReactNode {
  const spec = sidebarPanelRegistry.get(panel);
  const scope = useSidebarScope();
  const api = useSidebarApi();
  if (!spec) return <div className="text-muted-foreground p-2 text-xs">unknown panel: {panel}</div>;
  const props: SidebarPanelProps = { scope, payload, onPayloadChange, api };
  return spec.render(props);
}
