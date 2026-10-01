/**
 * Range-header parsing for the preview media route: RFC 9110 §14 single-range
 * semantics, adapted to windowed reads over the abstract filesystem service.
 */

/** A resolved, satisfiable byte range (both ends inclusive). */
export interface ByteRange {
  start: number
  end: number
}

/**
 * The outcome of parsing one `Range` header:
 * - {@link ByteRange} — serve 206 for these bytes,
 * - `{ unsatisfiable: true }` — well-formed but past EOF: serve 416,
 * - `null` — no (usable) range: serve the full 200 response.
 */
export type ParsedRange = ByteRange | { unsatisfiable: true } | null

/**
 * Parse a single `Range: bytes=...` header against a known size.
 *
 * Semantics (mirroring the video-preview contract this route serves):
 * - only the FIRST range of a multi-range set is honoured,
 * - `bytes=-N` is a suffix range (the last N bytes; `N >= size` = whole file),
 * - `bytes=N-` runs to EOF, `bytes=A-B` is clamped to EOF,
 * - non-integer / negative / empty / inverted specs are ignored (serve 200),
 * - a start at or past EOF is unsatisfiable (416).
 * @param raw - the raw `Range` header value (undefined when absent).
 * @param size - the file size in bytes.
 */
export function parseRange(raw: string | undefined, size: number): ParsedRange {
  if (raw === undefined) return null
  // An empty file satisfies no byte range.
  if (size <= 0) return { unsatisfiable: true }
  const match = /^bytes=(.+)$/i.exec(raw.trim())
  if (match === null) return null
  const [firstSpec = ''] = (match[1] ?? '').split(',') // first range only
  const spec = firstSpec.trim()
  if (spec === '') return null
  if (spec.startsWith('-')) {
    // Suffix range: the last N bytes.
    const suffix = Number(spec.slice(1))
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    if (suffix >= size) return { start: 0, end: size - 1 }
    return { start: size - suffix, end: size - 1 }
  }
  const dash = spec.indexOf('-')
  if (dash === -1) return null
  const startText = spec.slice(0, dash)
  const endText = spec.slice(dash + 1)
  const start = startText === '' ? 0 : Number(startText)
  const end = endText === '' ? size - 1 : Number(endText)
  if (!Number.isInteger(start) || start < 0 || !Number.isInteger(end)) return null
  if (start >= size) return { unsatisfiable: true }
  // An inverted range is ignored rather than answered with an error: the
  // caller receives a plain 200, matching the lenient spec reading.
  if (end < start) return null
  return { start, end: Math.min(end, size - 1) }
}
