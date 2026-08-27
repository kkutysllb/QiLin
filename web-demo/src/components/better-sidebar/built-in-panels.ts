import { FolderOpen } from "lucide-react";
import { createElement } from "react";

import { FileExplorerPanel } from "@/components/better-sidebar/panels/FileExplorer";
import { sidebarPanelRegistry } from "@/core/sidebar/panel-registry";

// The plan snippet uses JSX (<FolderOpen ... />) but this file is intentionally
// .ts per the task instructions — createElement keeps it JSX-free and valid.
export function registerBuiltinPanels(): () => void {
  const disposers = [
    sidebarPanelRegistry.register({
      id: "qilin:files",
      title: () => "Files",
      icon: createElement(FolderOpen, { className: "size-3.5" }),
      order: 10,
      render: ({ scope, payload }) =>
        createElement(FileExplorerPanel, {
          scope,
          root: (payload as { root?: string } | undefined)?.root ?? "",
        }),
    }),
  ];
  return () => disposers.forEach((d) => d());
}
