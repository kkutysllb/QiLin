/** macOS desktop detection for hiddenInset-titlebar layout variants. */

/**
 * Whether the client runs in the macOS desktop shell: the Electron preload
 * marks `<html>` with `data-platform="darwin"`; plain web never sets it.
 * Read at render time — the mark may arrive as late as DOMContentLoaded.
 * @returns true only inside the macOS Electron shell.
 */
export function isDarwinDesktop(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.dataset.platform === 'darwin'
}

/**
 * Subscribe to `data-platform` flips on `<html>` for decisions made outside
 * render (apply-world projections that cannot re-read the DOM per frame).
 * The listener fires on attribute changes after this call, not for the
 * current value — pair it with a fresh `isDarwinDesktop()` read.
 * @param listener - Called on every `data-platform` attribute change.
 * @returns Disposer that stops watching.
 */
export function watchDarwinDesktop(listener: () => void): () => void {
  if (typeof document === 'undefined') return () => {}
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-platform'] })
  return () => { observer.disconnect() }
}
