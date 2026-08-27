"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { readFile, writeFile, readRaw, FileApiError } from "@/core/files/api";
import type { SidebarPanelProps } from "@/core/sidebar/protocol";
import { fileViewerRegistry } from "@/core/sidebar/viewer-registry";

interface Payload { path: string }

export function FileViewerTab({ scope, payload, onPayloadChange, api }: SidebarPanelProps<Payload>) {
  void onPayloadChange;
  void api;
  const qc = useQueryClient();
  const entry = {
    name: payload.path.split("/").pop() ?? payload.path,
    type: "file" as const,
    size: 0,
    mtime: 0,
    mime: null,
  };
  const spec = fileViewerRegistry.match(entry);
  const { data: content, isLoading } = useQuery({
    queryKey: ["file-content", scope.threadId, payload.path],
    queryFn: async () => {
      try {
        return { kind: "text" as const, value: await readFile(scope.threadId, payload.path) };
      } catch (e) {
        if (e instanceof FileApiError && e.code === "binary_not_editable") {
          const blob = await readRaw(scope.threadId, payload.path);
          return { kind: "binary" as const, value: new Uint8Array(await blob.arrayBuffer()) };
        }
        throw e;
      }
    },
    enabled: !!spec,
  });
  if (!spec) return <div className="p-2 text-xs text-muted-foreground">no viewer for {entry.name}</div>;
  if (isLoading || !content) return <div className="p-2 text-xs text-muted-foreground">loading…</div>;
  const onSave = spec.editable
    ? async (next: string) => {
        await writeFile(scope.threadId, payload.path, next);
        await qc.invalidateQueries({ queryKey: ["files", scope.threadId] });
      }
    : undefined;
  const Viewer = spec.component;
  return <Viewer entry={entry} content={content.value} scope={scope} onSave={onSave} />;
}
