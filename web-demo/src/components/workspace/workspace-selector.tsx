"use client";

import {
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { isDesktop } from "@/core/config";
import { pickDirectory } from "@/core/desktop";
import { useI18n } from "@/core/i18n/hooks";
import {
  addRecentWorkspacePath,
  clearRecentWorkspacePaths,
  getRecentWorkspacePaths,
} from "@/core/settings/local";
import { cn } from "@/lib/utils";

/**
 * Extract the last path segment as a display-friendly basename.
 *
 * Handles both POSIX (`/`) and Windows (`\\`) separators. Returns the
 * full path when no separator is found (e.g. bare folder names).
 */
function basenameOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const slashIndex = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : trimmed;
}

/**
 * A compact chip that shows the active workspace and lets the user pick
 * a local directory for the current thread.
 *
 * - **Desktop (Electron)**: renders a "Select directory..." menu item
 *   that opens the native ``dialog:pick-directory`` picker via
 *   ``pickDirectory()``. The dropdown closes so the native dialog can
 *   take over.
 * - **Web**: renders an inline text input (always visible while the
 *   dropdown is open) where the user can paste an absolute path. The
 *   input lives inside a plain ``<div>`` rather than a
 *   ``DropdownMenuItem`` so Radix does not auto-close the menu on
 *   focus / click.
 *
 * The selected path is stored per-thread in localStorage and surfaced to
 * the backend via ``user_workspace_path`` in the run context.
 */
export function WorkspaceSelector({
  selectedPath,
  onSelect,
  className,
}: {
  /** Current ``user_workspace_path`` from thread context (undefined = default). */
  selectedPath?: string | undefined;
  /** Called when the user picks a new workspace path. */
  onSelect: (path: string | undefined) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [manualPath, setManualPath] = useState("");
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const desktop = isDesktop();

  // Refresh recent paths every time the dropdown opens so the list stays
  // in sync if the user added a path from another tab/thread. Also reset
  // the manual input so it does not carry over stale text.
  useEffect(() => {
    if (open) {
      setRecentPaths(getRecentWorkspacePaths());
      setManualPath("");
    }
  }, [open]);

  const displayName = useMemo(() => {
    if (!selectedPath) return t.inputBox.workspaceDefault;
    return basenameOf(selectedPath);
  }, [selectedPath, t.inputBox.workspaceDefault]);

  const handlePickDirectory = useCallback(async () => {
    // Should only be invoked on desktop because the menu item is hidden
    // on web. Guard anyway in case of a stale render.
    if (!desktop) return;
    setPicking(true);
    try {
      const picked = await pickDirectory({ title: t.inputBox.workspace });
      if (picked) {
        addRecentWorkspacePath(picked);
        onSelect(picked);
        setOpen(false);
      }
    } finally {
      setPicking(false);
    }
  }, [desktop, onSelect, t.inputBox.workspace]);

  const handleManualSubmit = useCallback(() => {
    const trimmed = manualPath.trim();
    if (!trimmed) return;
    addRecentWorkspacePath(trimmed);
    onSelect(trimmed);
    setOpen(false);
  }, [manualPath, onSelect]);

  const handleClearRecent = useCallback(() => {
    if (window.confirm(t.inputBox.workspaceClearConfirm)) {
      clearRecentWorkspacePaths();
      setRecentPaths([]);
    }
  }, [t.inputBox.workspaceClearConfirm]);

  const handleResetToDefault = useCallback(() => {
    onSelect(undefined);
    setOpen(false);
  }, [onSelect]);

  return (
    <div className={cn("flex items-center", className)}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex max-w-[200px] items-center gap-1 px-2 text-xs font-normal text-muted-foreground transition-colors hover:text-foreground"
            title={selectedPath ?? t.inputBox.workspaceDefaultDescription}
          >
            <FolderIcon className="size-3 shrink-0" />
            <span className="truncate">{displayName}</span>
            <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-72"
          side="top"
          sideOffset={8}
        >
          {/* Current selection header */}
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            {t.inputBox.workspace}
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={handleResetToDefault}
            className="gap-2"
          >
            <FolderIcon className="size-3.5 shrink-0 opacity-70" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">
                {t.inputBox.workspaceDefault}
              </span>
              <span className="text-muted-foreground truncate text-[10px]">
                {t.inputBox.workspaceDefaultDescription}
              </span>
            </div>
            {!selectedPath && (
              <CheckIcon className="size-3.5 shrink-0 text-emerald-500" />
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Desktop: native directory picker menu item */}
          {desktop && (
            <DropdownMenuItem
              onClick={handlePickDirectory}
              disabled={picking}
              className="gap-2"
            >
              <PlusIcon className="size-3.5 shrink-0" />
              <span className="text-sm">
                {t.inputBox.workspaceSelectDirectory}
              </span>
              {picking && (
                <span className="ml-auto animate-pulse text-[10px]">...</span>
              )}
            </DropdownMenuItem>
          )}

          {/* Web: always-visible inline manual input.
              Rendered as a plain <div> (NOT a DropdownMenuItem) so Radix
              does not auto-close the dropdown when the user focuses the
              input or clicks the confirm button. */}
          {!desktop && (
            <div className="flex flex-col gap-1.5 p-2">
              <span className="text-muted-foreground px-1 text-[10px]">
                {t.inputBox.workspaceEnterPath}
              </span>
              <Input
                value={manualPath}
                onChange={(e) => setManualPath(e.target.value)}
                placeholder={t.inputBox.workspaceEnterPathPlaceholder}
                className="h-8 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleManualSubmit();
                  }
                  if (e.key === "Escape") {
                    setOpen(false);
                  }
                }}
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground px-2 py-1 text-[10px] hover:text-foreground"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleManualSubmit}
                  disabled={!manualPath.trim()}
                  className="bg-primary text-primary-foreground rounded px-2 py-1 text-[10px] disabled:opacity-50"
                >
                  {t.inputBox.workspaceUsePath}
                </button>
              </div>
            </div>
          )}

          {/* Recent paths list */}
          {recentPaths.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {t.inputBox.workspaceRecent}
              </DropdownMenuLabel>
              {recentPaths.map((path) => (
                <DropdownMenuItem
                  key={path}
                  onClick={() => {
                    addRecentWorkspacePath(path);
                    onSelect(path);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <FolderOpenIcon className="size-3.5 shrink-0 opacity-70" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {basenameOf(path)}
                    </span>
                    <span className="text-muted-foreground truncate text-[10px]">
                      {path}
                    </span>
                  </div>
                  {selectedPath === path && (
                    <CheckIcon className="size-3.5 shrink-0 text-emerald-500" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleClearRecent}
                className="text-muted-foreground gap-2 text-xs"
              >
                <Trash2Icon className="size-3" />
                {t.inputBox.workspaceClear}
              </DropdownMenuItem>
            </>
          )}

          {/* Active path display (when set) + clear button */}
          {selectedPath && recentPaths.length === 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="flex items-start gap-2 p-2">
                <div className="text-muted-foreground min-w-0 flex-1 text-[10px] leading-relaxed break-all">
                  {selectedPath}
                </div>
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title={t.inputBox.workspaceDefault}
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
