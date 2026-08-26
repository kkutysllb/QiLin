/**
 * System-integration helpers for opening external links.
 *
 * Delegates to the Electron preload bridge (`shell.openExternal`) in desktop
 * mode and falls back to `window.open` in the browser.
 */

import { isDesktop } from "../config";

/** Open a URL in the system's default browser. */
export async function openExternalUrl(url: string): Promise<void> {
  if (!isDesktop()) {
    window.open(url, "_blank");
    return;
  }
  try {
    await window.kworksDesktop!.openExternal(url);
  } catch (e) {
    // Swallow IPC failure — opening external links is best-effort.
    void e;
  }
}
