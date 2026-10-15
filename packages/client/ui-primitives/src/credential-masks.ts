/**
 * Display forms of credential ranges: one mark per hidden code point, with line
 * breaks left in place so a masked multi-line value keeps its line count.
 */
import { KEY_BLOCK_END_LITERAL, KEY_BLOCK_TAIL } from './credential-formats.ts'

/** Character that replaces each hidden credential character. */
export const MASK = '*'

/** Leading characters of a prefixed key left readable: the provider prefix and little else. */
const VISIBLE_PREFIX = 8

/** Shortest footer line, from its newline through the header tail. */
const MIN_FOOTER_LINE = 1 + KEY_BLOCK_END_LITERAL.length + KEY_BLOCK_TAIL.length

/** Builds the display form of the original `text[start, end)`. */
export type MaskBuilder = (text: string, start: number, end: number) => string

/**
 * One mark per code point in `text[start, end)`, with line breaks kept in
 * place. A surrogate pair counts once, as a reader sees one character.
 * @param text - the original text.
 * @param start - first offset of the range.
 * @param end - offset after the range.
 * @returns the masked range.
 */
export function maskRange(text: string, start: number, end: number): string {
  let masked = ''
  let count = 0
  for (let index = start; index < end; index++) {
    const code = text.charCodeAt(index)
    if (code === 10 || code === 13) {
      masked += MASK.repeat(count) + (code === 10 ? '\n' : '\r')
      count = 0
      continue
    }
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < end) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) index++
    }
    count++
  }
  return masked + MASK.repeat(count)
}

/**
 * A prefixed key keeps its first eight characters readable — the provider prefix
 * and little else — and masks the rest.
 * @param text - the original text.
 * @param start - first offset of the range.
 * @param end - offset after the range.
 * @returns the masked key.
 */
export function maskPrefixed(text: string, start: number, end: number): string {
  return text.slice(start, start + VISIBLE_PREFIX) + maskRange(text, start + VISIBLE_PREFIX, end)
}

/**
 * A private key block keeps its `BEGIN` line, its footer line when present, and
 * every line break; its body is masked line by line. A block written on one line
 * is masked whole.
 * @param text - the original text.
 * @param start - first offset of the range.
 * @param end - offset after the range.
 * @returns the masked block.
 */
export function maskKeyBlock(text: string, start: number, end: number): string {
  let bodyStart = start
  for (let index = start; index < end; index++) {
    if (text.charCodeAt(index) === 10) {
      bodyStart = index + 1
      break
    }
  }
  let bodyEnd = end
  for (let index = end - MIN_FOOTER_LINE; index >= bodyStart; index--) {
    if (text.charCodeAt(index) === 10 && text.startsWith(KEY_BLOCK_END_LITERAL, index + 1)) {
      bodyEnd = index
      break
    }
  }
  return text.slice(start, bodyStart) + maskRange(text, bodyStart, bodyEnd) + text.slice(bodyEnd, end)
}
