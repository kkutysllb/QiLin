/**
 * The durable label prefix of the retired Side Chat tabs (`Side: …`).
 *
 * The tab and its thread routes are gone, but threads created by older builds
 * persist as `origin: 'subagent'` child sessions carrying the prefix — the
 * subagent views (live route + client detection) still classify them with
 * this constant, so old sessions keep rendering honestly.
 */

/** The durable thread-label prefix (also the row filter in the client list). */
export const SIDE_LABEL_PREFIX = 'Side: '
