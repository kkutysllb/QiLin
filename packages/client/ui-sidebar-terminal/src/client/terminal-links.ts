/**
 * Terminal URL links: the line scanner and the activation rules behind the
 * xterm link provider, kept free of xterm types so the regex, the line
 * scanner, the modifier gate, and the scheme guard are unit-testable without
 * mounting a terminal.
 *
 * A plain click stays xterm's text-selection gesture: activation requires
 * Ctrl (Windows/Linux) or Cmd (macOS), as in every modern terminal. Only
 * http(s) targets are handed on; a `file://` or `mailto:` URL printed by a
 * tool stays underlined but inert, so nothing but a web page can reach the
 * opener.
 */

/** Schemes whose URLs may be opened. Anything else is shown but refused. */
const OPENABLE_SCHEMES = new Set(['http:', 'https:'])

/**
 * The URL pattern scanned in each terminal line.
 *
 * The leading `\b` keeps a longer word ending in the scheme from matching, and
 * the character class excludes ASCII whitespace plus the wrapping punctuation
 * shells emit around URLs (quotes, angle brackets, brackets, braces, pipes,
 * backslashes, backticks), so `"https://example.com"` links to the URL alone.
 * The `g` flag lets a line carry several URLs; the scanner resets `lastIndex`
 * around every use.
 */
export const TERMINAL_URL_REGEX = /\bhttps?:\/\/[^\s"'<>[\]{}|\\^`]+/gi

/** One URL found in a terminal line. */
export interface TerminalUrlMatch {
  /** 0-based index of the URL's first character in the line. */
  readonly start: number
  /** The matched URL, with wrapping punctuation removed. */
  readonly text: string
}

/** A buffer range in xterm's coordinates: `x` is 1-based, `end` is inclusive. */
export interface TerminalLinkRange {
  readonly start: { readonly x: number; readonly y: number }
  readonly end: { readonly x: number; readonly y: number }
}

/** One link over a terminal line, ready for the provider to attach `activate`. */
export interface TerminalLinkDescriptor {
  readonly range: TerminalLinkRange
  readonly text: string
}

/**
 * Trim closing parentheses a wrapper added, keeping the balanced ones a URL
 * owns.
 *
 * The character class keeps `(` and `)`, because real URLs carry them
 * (`…/Python_(programming_language)`); a shell that wraps a URL in parens
 * therefore captures the wrapper's `)`. Only the excess closers are removed,
 * so `https://example.com)` loses its paren while the Wikipedia URL and a URL
 * with more openers than closers are untouched.
 * @param url - the matched URL text.
 * @returns the URL with unmatched trailing closers removed.
 */
function trimUnbalancedTrailingParens(url: string): string {
  let opens = 0
  let closers = 0
  for (let i = 0; i < url.length; i += 1) {
    const character = url[i]
    if (character === '(') opens += 1
    else if (character === ')') closers += 1
  }
  const excess = closers - opens
  if (excess <= 0) return url
  let end = url.length
  let stripped = 0
  while (end > 0 && url[end - 1] === ')' && stripped < excess) {
    end -= 1
    stripped += 1
  }
  return url.slice(0, end)
}

/**
 * Find every http(s) URL in one line of terminal text.
 * @param line - the line's text, as `translateToString(true)` reports it.
 * @returns the matches in source order, each with its 0-based start offset.
 */
export function findTerminalUrlsInLine(line: string): TerminalUrlMatch[] {
  TERMINAL_URL_REGEX.lastIndex = 0
  const matches: TerminalUrlMatch[] = []
  let match: RegExpExecArray | null
  while ((match = TERMINAL_URL_REGEX.exec(line)) !== null) {
    // A match always opens with the scheme, so trimming punctuation can never
    // empty it.
    matches.push({ start: match.index, text: trimUnbalancedTrailingParens(match[0]) })
  }
  TERMINAL_URL_REGEX.lastIndex = 0
  return matches
}

/**
 * Build the link descriptors for one terminal line.
 *
 * A URL never spans wrapped rows — each wrapped row is its own buffer line —
 * so every range sits on the line xterm asked about.
 * @param lineText - the line's text, as `translateToString(true)` reports it.
 * @param lineNumber - the 1-based buffer line number xterm passed to the provider.
 * @returns the descriptors in source order; empty when the line has no URL.
 */
export function buildTerminalLinks(lineText: string, lineNumber: number): TerminalLinkDescriptor[] {
  return findTerminalUrlsInLine(lineText).map(({ start, text }) => ({
    range: {
      start: { x: start + 1, y: lineNumber },
      end: { x: start + text.length, y: lineNumber },
    },
    text,
  }))
}

/**
 * Decide whether a click opens the link it landed on.
 * @param event - the mouse event xterm passed to the link's `activate`.
 * @returns whether the user held the open modifier.
 */
export function shouldActivateTerminalLink(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey
}

/**
 * The target to open for one matched URL, or undefined when nothing may be
 * opened. `new URL` rejects malformed text, and the scheme guard keeps
 * anything but http(s) away from the opener.
 * @param uri - the matched URL text.
 * @returns the normalized URL to open, or undefined when it is refused.
 */
export function terminalUrlTarget(uri: string): string | undefined {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return undefined
  }
  return OPENABLE_SCHEMES.has(url.protocol) ? url.toString() : undefined
}
