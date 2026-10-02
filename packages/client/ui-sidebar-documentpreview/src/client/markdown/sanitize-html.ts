/**
 * The markdown preview's raw-HTML pass: one authored HTML run through
 * DOMPurify with this preview's denylist on top of its defaults, plus the
 * post-sanitize hardening the HTML document preview also applies — anchors
 * open in a new tab with `noopener`, and local media sources are rewritten
 * through the authenticated file route.
 *
 * Only the preview opts in. `MarkdownText` renders raw HTML as literal text
 * unless its owner supplies a renderer, so every other consumer keeps the
 * stricter default; this module is the owner-side policy that makes the opt-in
 * safe for untrusted model output.
 */
import DOMPurify from 'dompurify'

/**
 * Active content, form chrome, and document-level elements stay out. DOMPurify
 * already removes scripts and event handlers; this list also refuses the
 * framing, embedding, and form elements a preview never needs.
 */
const FORBID_TAGS = [
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'form', 'input', 'button', 'select', 'option', 'textarea', 'meta', 'link', 'base', 'noscript',
]

/** Attributes that make an inert element active on its own. */
const FORBID_ATTR = ['srcdoc', 'formaction']

/**
 * Elements that may not sit inside a phrasing wrapper. A leading one decides
 * the wrapper the caller renders, so block HTML stays block-level instead of
 * being squeezed into a span.
 */
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hgroup', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
])

/** The html run's opening tag name, when it starts with one. */
const LEADING_TAG = /^\s*<\s*([a-z][a-z0-9-]*)/iu

/**
 * Decide whether an HTML run opens with a block-level element.
 *
 * The markdown parse already places the run where it belongs; this only picks
 * the wrapper, so a run that starts with a comment, a closing tag, or anything
 * unrecognized stays phrasing-level.
 * @param source - the authored HTML run.
 * @returns whether the run opens with a block-level element.
 */
export function opensWithBlockTag(source: string): boolean {
  const name = LEADING_TAG.exec(source)?.[1]
  return name !== undefined && BLOCK_TAGS.has(name.toLowerCase())
}

/**
 * Decide whether a run may be rendered as sanitized HTML.
 *
 * Only a complete block qualifies. The parse hands one run per tag in phrasing
 * context, so an inline `<sub>` arrives without the `</sub>` that closes it in
 * the source — rendering it would drop the markup and keep the text, which is
 * a silent change from showing the tag. A block opening without any closing tag
 * (`<div class="note">` … Markdown … `</div>` across runs) would render as an
 * empty element around nothing. Both stay literal; both are recorded in the
 * package README.
 * @param source - the authored HTML run.
 * @returns whether the run is a complete block-level element.
 */
export function renderableMarkdownHtml(source: string): boolean {
  return opensWithBlockTag(source) && source.includes('</')
}

/**
 * Sanitize one authored HTML run.
 * @param source - the raw HTML the markdown stream carried.
 * Only a run {@link renderableMarkdownHtml} accepts reaches this, so the
 * markup is always rendered in a block wrapper.
 * @param resolveMedia - rewrites one `src` destination, returning undefined when the destination is refused.
 * @returns the sanitized markup; empty when nothing survived.
 */
export function sanitizeMarkdownHtml(
  source: string,
  resolveMedia: (destination: string) => string | undefined,
): string {
  const fragment = DOMPurify.sanitize(source, { FORBID_TAGS, FORBID_ATTR, RETURN_DOM_FRAGMENT: true })
  for (const anchor of fragment.querySelectorAll('a')) {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }
  for (const image of fragment.querySelectorAll('img')) {
    const destination = image.getAttribute('src')
    if (destination === null) continue
    const resolved = resolveMedia(destination)
    // A refused destination loses its source rather than keeping the authored
    // one: the browser must not fetch what the resolver would not serve.
    if (resolved === undefined) image.removeAttribute('src')
    else image.setAttribute('src', resolved)
  }
  const holder = document.createElement('div')
  holder.append(fragment)
  return holder.innerHTML
}
