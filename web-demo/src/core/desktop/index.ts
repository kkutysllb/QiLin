/**
 * Desktop (Electron) integration utilities.
 *
 * Provides a thin abstraction layer over the Electron preload bridge so the
 * rest of the frontend can import from a single location without worrying
 * about whether `window.kworksDesktop` exists.
 *
 * Every function has a browser fallback (no-op / native browser behaviour)
 * so the same code path runs unchanged in the web build.
 */

import { isDesktop } from "../config";

export type {
  BackendStatus,
  BackendStatusKind,
  EmbeddedTerminalSession,
  FileDialogOptions,
  GatewayConfig,
  PickedFile,
  UpdateInfo,
} from "./types";

import type {
  BackendStatus,
  EmbeddedTerminalSession,
  FileDialogOptions,
  PickedFile,
} from "./types";

export type OpenProjectTerminalResult = "opened" | "copied" | "failed";

// ── Backend management ───────────────────────────────────────────────────

/** Get the current backend status via Electron IPC. */
export async function getBackendStatus(): Promise<BackendStatus | null> {
  if (!isDesktop()) return null;
  try {
    return await window.kworksDesktop!.getBackendStatus();
  } catch (e) {
    return null;
  }
}

/** Start the backend process. */
export async function startBackend(): Promise<BackendStatus | null> {
  if (!isDesktop()) return null;
  try {
    return await window.kworksDesktop!.startBackend();
  } catch (e) {
    return null;
  }
}

/** Stop the backend process. */
export async function stopBackend(): Promise<BackendStatus | null> {
  if (!isDesktop()) return null;
  try {
    return await window.kworksDesktop!.stopBackend();
  } catch (e) {
    return null;
  }
}

/** Restart the backend process. */
export async function restartBackend(): Promise<BackendStatus | null> {
  if (!isDesktop()) return null;
  try {
    return await window.kworksDesktop!.restartBackend();
  } catch (e) {
    return null;
  }
}

/** Get recent backend log lines. */
export async function getBackendLogs(): Promise<string[]> {
  if (!isDesktop()) return [];
  try {
    return await window.kworksDesktop!.getBackendLogs();
  } catch (e) {
    return [];
  }
}

// ── File dialog ──────────────────────────────────────────────────────────

/**
 * Open a native file dialog and return selected files as File objects.
 * Falls back to a hidden `<input type="file">` when not in desktop mode.
 */
export async function openFilePicker(
  options: FileDialogOptions = {},
): Promise<File[]> {
  if (!isDesktop()) {
    return openBrowserFilePicker(options);
  }

  try {
    const picked: PickedFile[] =
      await window.kworksDesktop!.pickFiles(options);
    return picked.map((p) => {
      // Copy into a fresh ArrayBuffer-backed buffer so TS accepts it as a
      // BlobPart (the IPC bridge may hand back a SharedArrayBuffer-backed view).
      const buf = new Uint8Array(p.data).slice();
      const blob = new Blob([buf], { type: p.type });
      return new File([blob], p.name, { type: p.type });
    });
  } catch (e) {
    return openBrowserFilePicker(options);
  }
}

function openBrowserFilePicker(
  options: FileDialogOptions,
): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options.multiple ?? false;
    if (options.filters?.length) {
      input.accept = options.filters
        .flatMap((f) => f.extensions.map((ext) => `.${ext}`))
        .join(",");
    }
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      resolve(files);
    };
    input.click();
  });
}

// ── Directory picker (Code Mode project selection) ──────────────────────

/**
 * Open a native directory picker and return the selected folder path.
 * Returns null if the user cancels or in browser mode (no native picker).
 */
export async function pickDirectory(
  options: { title?: string } = {},
): Promise<string | null> {
  if (!isDesktop()) return null;
  try {
    return await window.kworksDesktop!.pickDirectory(options);
  } catch (e) {
    return null;
  }
}

// ── Open folder in system file manager ──────────────────────────────

/**
 * Open a local folder in the system file manager (Finder / Explorer).
 * Falls back to copying the path to clipboard in browser mode.
 */
export async function openFolder(folderPath: string): Promise<void> {
  if (!isDesktop()) {
    // Browser fallback: copy path to clipboard
    try {
      await navigator.clipboard.writeText(folderPath);
    } catch {
      // Clipboard may be unavailable
    }
    return;
  }
  try {
    await window.kworksDesktop!.openFolder(folderPath);
  } catch (e) {
    // Swallow IPC failure — folder opening is best-effort.
    void e;
  }
}

/** Open the embedded project terminal in desktop mode, or copy path on web. */
export async function openProjectTerminal(
  folderPath: string,
): Promise<OpenProjectTerminalResult> {
  if (!folderPath.trim()) return "failed";

  if (!isDesktop()) {
    try {
      await navigator.clipboard.writeText(folderPath);
      return "copied";
    } catch (e) {
      return "failed";
    }
  }

  return "opened";
}

export async function startEmbeddedTerminal(
  folderPath: string,
): Promise<EmbeddedTerminalSession | null> {
  if (!folderPath.trim() || !isDesktop()) return null;
  try {
    return await window.kworksDesktop!.startTerminal(folderPath);
  } catch (e) {
    return null;
  }
}

export async function writeEmbeddedTerminal(
  sessionId: string,
  data: string,
): Promise<boolean> {
  if (!sessionId || !isDesktop()) return false;
  try {
    await window.kworksDesktop!.writeTerminal(sessionId, data);
    return true;
  } catch (e) {
    return false;
  }
}

export async function resizeEmbeddedTerminal(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<boolean> {
  if (!sessionId || !isDesktop()) return false;
  try {
    await window.kworksDesktop!.resizeTerminal(sessionId, cols, rows);
    return true;
  } catch (e) {
    return false;
  }
}

export async function stopEmbeddedTerminal(
  sessionId: string,
): Promise<void> {
  if (!sessionId || !isDesktop()) return;
  try {
    await window.kworksDesktop!.stopTerminal(sessionId);
  } catch (e) {
    // Swallow IPC failure — terminal stop is best-effort.
    void e;
  }
}

export function onEmbeddedTerminalData(
  handler: (event: { sessionId: string; data: string }) => void,
): () => void {
  if (!isDesktop()) return () => undefined;
  return window.kworksDesktop!.onTerminalData(handler);
}

export function onEmbeddedTerminalExit(
  handler: (event: {
    sessionId: string;
    code: number | null;
    signal: string | null;
  }) => void,
): () => void {
  if (!isDesktop()) return () => undefined;
  return window.kworksDesktop!.onTerminalExit(handler);
}

export async function copyProjectTerminalPath(folderPath: string): Promise<OpenProjectTerminalResult> {
  try {
    await navigator.clipboard.writeText(folderPath);
    return "copied";
  } catch (e) {
    return "failed";
  }
}

// Re-export system-integration helpers kept in dedicated modules.
export { openExternalUrl } from "./external-links";
export { initDragDrop, onDesktopFileDrop } from "./dnd";
