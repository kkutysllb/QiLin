/**
 * The text a viewer selection contributes to the conversation draft.
 * Everything here is string math — no React, no ctx — so the unit tests cover
 * it directly.
 *
 * Insert shape:
 * - Selection of at most {@link SELECTION_LIMIT} characters: a fenced block
 *   whose info line is the viewer's path with the selected line span, and
 *   whose body is the selected text.
 * - Longer selection: the info line alone, because an empty fence in the draft
 *   costs a keystroke to delete and says nothing the line does not.
 * - The path is the tab address's own path, which is already the
 *   workspace-relative spelling when the file is inside the Session workspace.
 * - A single-line selection writes `path:12`; a multi-line one writes
 *   `path:12-15`. The rendered preview cannot map its DOM back to source
 *   lines, so the lines come from {@link linesOfSelection} — a best-effort
 *   reverse search that reports nothing on an ambiguous or missing hit.
 */

/** Longest selected text inserted with its content, in UTF-16 code units. */
export const SELECTION_LIMIT = 500

/** The source line span one selection maps to, 1-based and inclusive. */
export interface SelectionLines {
  readonly start: number
  readonly end: number
}

/**
 * The fenced block's info line: the viewer's path, followed by the line or
 * line range when the selection mapped to source lines.
 * @param path - the path the viewer opened.
 * @param lines - the mapped source span, absent when the lookup reported none.
 * @returns `rel`, `rel:12`, or `rel:12-15`.
 */
export function headerOf(path: string, lines?: SelectionLines): string {
  if (lines === undefined) return path
  if (lines.end > lines.start) return `${path}:${lines.start}-${lines.end}`
  return `${path}:${lines.start}`
}

/**
 * The text one selection appends to the composer draft.
 * @param path - the path the viewer opened.
 * @param lines - the mapped source span, absent when the lookup reported none.
 * @param selected - the selected text as the DOM reported it.
 * @returns the fenced block, or the info line alone for an oversized selection.
 */
export function buildSelectionInsert(
  path: string,
  lines: SelectionLines | undefined,
  selected: string,
): string {
  const header = headerOf(path, lines)
  if (selected.length > SELECTION_LIMIT) return header
  return `\`\`\`${header}\n${selected}\n\`\`\``
}

/**
 * 1-based line number of one character index in a text.
 * @param source - the whole text.
 * @param index - the character index to locate.
 * @returns the line the index falls on.
 */
function lineAt(source: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (source[i] === '\n') line++
  }
  return line
}

/**
 * Reverse-map a rendered selection back to source lines. The preview's
 * selection is plain text with block boundaries flattened to `\n`, so one
 * trailing newline is stripped first and the rest is a substring search: only
 * an exactly-once occurrence yields lines, because the reported ones must not
 * point a reader at the wrong place.
 * @param source - the file's text as the viewer read it.
 * @param selected - the selected text as the DOM reported it.
 * @returns the mapped span, or null when the hit is ambiguous or missing.
 */
export function linesOfSelection(source: string, selected: string): SelectionLines | null {
  const text = selected.endsWith('\n') ? selected.slice(0, -1) : selected
  if (text === '') return null
  const at = source.indexOf(text)
  if (at === -1) return null
  if (source.indexOf(text, at + 1) !== -1) return null
  return {
    start: lineAt(source, at),
    end: lineAt(source, at + Math.max(text.length - 1, 0)),
  }
}
