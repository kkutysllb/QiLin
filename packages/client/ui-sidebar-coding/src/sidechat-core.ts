/**
 * The durable label prefix of the retired Side Chat tabs (`Side: …`).
 *
 * The tab and its thread routes are gone, but threads created by older builds
 * persist as `origin: 'subagent'` child sessions carrying the prefix — the
 * subagent views (live route + client detection) still classify them with
 * this constant, so old sessions keep rendering honestly.
 */

/** The persisted title marker of the retired Side Chat tabs, matched against
 *  stored session titles for classification (never rendered from here). */
export const LEGACY_SIDE_TAB_PREFIX = 'Side: '
