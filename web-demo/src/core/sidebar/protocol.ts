import type { ReactNode } from "react";

export interface SidebarScope {
  threadId: string;
}

export interface FileEntryLike {
  name: string;
  type: "file" | "dir" | "symlink" | "broken";
  size: number;
  mtime: number;
  mime: string | null;
}

export interface SidebarPanelApi {
  openTab: (spec: { panel: string; payload?: unknown; title?: string }) => void;
  closeSelf: () => void;
  toast: (msg: string, tone?: "info" | "error") => void;
}

export interface SidebarPanelProps<P = unknown> {
  scope: SidebarScope;
  payload: P;
  onPayloadChange: (next: P) => void;
  api: SidebarPanelApi;
}

export interface SidebarPanelSpec<P = unknown> {
  id: string;
  title: string | (() => string);
  icon?: ReactNode;
  order?: number;
  fileViewer?: { exts: readonly string[]; match?: (entry: FileEntryLike) => boolean };
  render: (props: SidebarPanelProps<P>) => ReactNode;
  defaultPayload?: () => P;
}

export interface FileViewerProps {
  entry: FileEntryLike;
  content: string | Uint8Array;
  scope: SidebarScope;
  onSave?: (next: string) => Promise<void>;
}

export interface FileViewerSpec {
  id: string;
  exts: readonly string[];
  match?: (entry: FileEntryLike, head?: string) => boolean;
  component: React.ComponentType<FileViewerProps>;
  editable?: boolean;
}

export interface SidebarTabState {
  tabs: ReadonlyArray<{
    key: string;
    panel: string;
    title: string;
    icon?: string | null;
    payload: Record<string, unknown>;
    pinned: boolean;
    created_at: number;
  }>;
  active: string | null;
  split: "single" | "vertical" | "horizontal";
}
