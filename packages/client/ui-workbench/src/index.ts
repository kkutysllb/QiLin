/** Host half: the workbench owner is browser-side state with no host registration. */

/**
 * No host apply: every fact this package owns lives in the browser (the tag
 * selection is a per-browser view preference), so the node half ships empty
 * to keep the package a well-formed Loader entry.
 */
export function apply(): void {}
