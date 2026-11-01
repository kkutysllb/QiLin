/**
 * Explicit Markdown blockquote recognition and its source token, shared by the
 * user-text projection and any composer-side quote gesture.
 *
 * A quote is ordinary message text: consecutive lines that start with up to
 * three spaces and one `>` marker, plus one optional trailing space or tab.
 * Inline greater-than signs stay ordinary text. The first decoded line may name
 * the message the quote came from as `[quoted](qilin-quote:<node-key>)`, which
 * the projection consumes for a jump control and never shows as excerpt text.
 * Line endings normalize to `\n` on decode, so a message sent from any editor
 * prints the same excerpt.
 *
 * This module is the single home for both directions of that form: the
 * projection's scanner and decoder, and the serializer a quote gesture hands
 * the composer. Adding the composer's insertion seat needs no second copy.
 */

/** One blockquote span in the original UTF-16 text, excluding its trailing line break. */
export interface MessageQuoteRange {
  readonly start: number
  readonly end: number
}

/** Scheme of the optional first line naming the quoted message's Chat node key. */
export const QUOTE_WIRE_SCHEME = 'qilin-quote:'

/** Marker line a quote block may open with: `[label](qilin-quote:<key>)`. */
const SOURCE_LINE_RE = new RegExp('^\\[[^\\]\\n]*\\]\\(qilin-quote:([^)\\s]+)\\)$', 'u')

/** One decoded quote block: its excerpt text and the source it names, when any. */
export interface QuotedExcerpt {
  /** Excerpt shown and copied, without the source marker line. */
  readonly text: string
  /** Chat node key the quote names, when its first line carries one. */
  readonly source: string | undefined
}

/**
 * Remove one blockquote marker from each line and normalize line endings.
 * @param text - consecutive blockquote lines, with up to three leading spaces.
 * @returns excerpt text with original line endings normalized.
 */
export function quoteTextOf(text: string): string {
  return text.replace(/\r\n?/gu, '\n').replace(/^ {0,3}>[ \t]?/gmu, '')
}

/**
 * Recognize consecutive explicitly marked Markdown blockquote lines.
 * @param text - complete original message text.
 * @returns ordered nonblank quote spans; inline greater-than signs remain ordinary text.
 */
export function messageQuoteRanges(text: string): readonly MessageQuoteRange[] {
  const ranges: MessageQuoteRange[] = []
  for (const match of text.matchAll(/^ {0,3}>[^\r\n]*(?:\r?\n {0,3}>[^\r\n]*)*/gmu)) {
    if (quoteTextOf(match[0]).trim() !== '') ranges.push({ start: match.index, end: match.index + match[0].length })
  }
  return ranges
}

/**
 * Split one decoded quote block into the source it names and its excerpt.
 * @param decoded - block text already stripped of its quote markers.
 * @returns the excerpt shown to the reader and the named source, if present.
 */
export function quotedExcerptOf(decoded: string): QuotedExcerpt {
  const breakAt = decoded.indexOf('\n')
  const first = breakAt === -1 ? decoded : decoded.slice(0, breakAt)
  const match = SOURCE_LINE_RE.exec(first)
  if (match === null) return { text: decoded, source: undefined }
  return { text: breakAt === -1 ? '' : decoded.slice(breakAt + 1), source: match[1] }
}

/**
 * Serialize one excerpt as the blockquote text a quote gesture inserts.
 * @param text - excerpt to quote, as selected.
 * @param source - Chat node key of the quoted message, when the caller knows it.
 * @returns blockquote lines, one per excerpt line, with the source marker first.
 */
export function quoteBlockTextOf(text: string, source?: string): string {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n').map(line => `> ${line}`)
  return source === undefined
    ? lines.join('\n')
    : `> [quoted](${QUOTE_WIRE_SCHEME}${source})\n${lines.join('\n')}`
}

/** One quoted excerpt as a selection gesture hands it over. */
export interface QuoteFragment {
  /** Excerpt text as selected, without quote markers. */
  readonly text: string
  /** Chat node key of the quoted message, when the caller knows it. */
  readonly source?: string | undefined
}

/**
 * Serialize one selected excerpt into the message text a quote gesture inserts.
 * @param fragment - excerpt text and the source it names, if any.
 * @returns blockquote lines the composer receives as ordinary draft text.
 */
export function quoteInsertionOf(fragment: QuoteFragment): string {
  return quoteBlockTextOf(fragment.text, fragment.source)
}
