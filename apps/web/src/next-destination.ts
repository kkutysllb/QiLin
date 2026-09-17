/**
 * The `?next=` destination a pre-session document may hand the browser after it
 * establishes a session. Both the landing page and the sign-in document read the
 * same way, so one validation owns what counts as a same-site destination.
 */

/** Console entry path used when the request carries no usable `next` value. */
const ENTRY_PATH = '/workspace'

/** Query parameter carrying the post-authentication destination. */
const NEXT_PARAMETER = 'next'

/** Whitespace and control codes a browser strips or folds while resolving a URL. */
const URL_NOISE = /[\u0000-\u0020\u007f]/u

/** Leading `scheme:` of an absolute URL. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/iu

/**
 * Validate the `?next=` destination.
 * A same-site absolute path is honoured; a scheme, a protocol-relative path, a
 * backslash, or a character the browser folds away falls back to the console.
 * @returns the requested path, or the console entry path.
 */
export function nextDestination(): string {
  const requested = new URLSearchParams(location.search).get(NEXT_PARAMETER)
  if (requested === null || requested === '') return ENTRY_PATH
  if (!requested.startsWith('/')) return ENTRY_PATH
  if (requested.startsWith('//')) return ENTRY_PATH
  if (URL_NOISE.test(requested) || requested.includes('\\')) return ENTRY_PATH
  if (URL_SCHEME.test(requested)) return ENTRY_PATH
  return requested
}
