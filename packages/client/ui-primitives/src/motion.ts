/**
 * Motion preference for the browser-driven animations in this package.
 * Animation owners ask before starting movement, so one query decides the
 * answer for list glides, fades, and marquees alike.
 */

/**
 * Whether the platform asked for reduced motion.
 * A platform without the query (Node, a test DOM that implements no matcher)
 * has expressed no preference, so motion stays allowed.
 * @returns true when the reader prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
