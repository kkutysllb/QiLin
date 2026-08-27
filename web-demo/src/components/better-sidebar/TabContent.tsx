"use client";
import { PanelHost } from "@/core/sidebar/panel-host";
import type { SidebarTabState } from "@/core/sidebar/protocol";

export function TabContent({ tab, onChangePayload }: {
  tab: SidebarTabState["tabs"][number];
  onChangePayload: (next: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col">
      {/* PanelHost's onPayloadChange is loosely typed (unknown); narrow here so
          tabs keep a Record<string, unknown> payload contract. */}
      <PanelHost
        panel={tab.panel}
        payload={tab.payload}
        onPayloadChange={(next) => onChangePayload(next as Record<string, unknown>)}
      />
    </div>
  );
}
