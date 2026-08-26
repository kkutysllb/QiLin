/**
 * Auto-updater utilities for the desktop app.
 *
 * Wraps the Electron `electron-updater` channels so the frontend can check
 * for and install application updates without importing any Electron code.
 */

import { isDesktop } from "../config";

import type { UpdateInfo } from "./types";

const noop = () => undefined;

/* ── Update-ready store ─────────────────────────────────────────────
 * Module-level state so ANY component (e.g. the sidebar footer badge)
 * can react to "download finished" without prop drilling. The main
 * process pushes `updater:ready` once the background download completes;
 * `setUpdateReady` fans that out to every subscriber.
 */
export interface UpdateReadyInfo {
  version: string;
  releaseDate?: string;
}

let readyInfo: UpdateReadyInfo | null = null;
const readyListeners = new Set<(info: UpdateReadyInfo | null) => void>();

/** Latest "download finished" payload, or null when nothing is staged. */
export function getUpdateReady(): UpdateReadyInfo | null {
  return readyInfo;
}

/** Set (or clear) the staged-update info and notify all subscribers. */
export function setUpdateReady(info: UpdateReadyInfo | null): void {
  readyInfo = info;
  for (const listener of readyListeners) listener(info);
}

/**
 * Subscribe to staged-update changes. Immediately fires with the current
 * value, then on every `setUpdateReady`. Returns an unsubscribe fn.
 */
export function subscribeUpdateReady(
  listener: (info: UpdateReadyInfo | null) => void,
): () => void {
  readyListeners.add(listener);
  listener(readyInfo);
  return () => {
    readyListeners.delete(listener);
  };
}

/** Check if an application update is available. */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  if (!isDesktop()) return null;
  try {
    return await window.kworksDesktop!.checkForUpdates();
  } catch (e) {
    return null;
  }
}

/** Download and install the available update, then restart. */
export async function installUpdate(): Promise<boolean> {
  if (!isDesktop()) return false;
  try {
    return await window.kworksDesktop!.installUpdate();
  } catch (e) {
    return false;
  }
}

/**
 * Subscribe to the "download started" push event.
 *
 * Fired when electron-updater finds a new version and begins the
 * background download (``autoDownload=true``). Use this for a non-blocking
 * toast only — do NOT show a modal here. The user will be prompted again
 * via ``onUpdateReady`` once the download finishes.
 */
export function onUpdateDownloading(
  handler: (info: { version: string; releaseDate?: string }) => void,
): () => void {
  if (!isDesktop()) return noop;
  try {
    return window.kworksDesktop!.onUpdateDownloading(handler);
  } catch (e) {
    return noop;
  }
}

/**
 * Subscribe to the "update ready" push event.
 *
 * Fired when the background download has completed and the installer is
 * staged. This is the right place to show the "restart now to install"
 * prompt. If the user dismisses it, the update will still auto-install on
 * the next app quit.
 */
export function onUpdateReady(
  handler: (info: { version: string; releaseDate?: string }) => void,
): () => void {
  if (!isDesktop()) return noop;
  try {
    return window.kworksDesktop!.onUpdateReady(handler);
  } catch (e) {
    return noop;
  }
}
