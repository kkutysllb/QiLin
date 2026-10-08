/** Human-readable byte counts shared by the client's attachment and file surfaces. @module @qilin-agent/client-ui-primitives/file-size */

/**
 * Byte count as compact user-facing size text (`312B`, `4.2KB`, `1.5MB`, `2.4GB`).
 * @param bytes - exact byte count.
 * @returns whole-unit text with one decimal below ten of the chosen unit.
 */
export function fileSizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`
  const gb = mb / 1024
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}GB`
}

/**
 * The same byte count as rounded whole units with a space before the unit
 * (`512 B`, `4 KB`, `3 MB`). File-error copy states a size cap this way, where
 * the compact form's decimals and missing space would read as a different
 * sentence; both spellings stay because each is pinned by the surfaces showing it.
 * @param bytes - exact byte count.
 * @returns the nearest unit at or below the count, rounded to a whole number.
 */
export function fileSizeRoundedText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
