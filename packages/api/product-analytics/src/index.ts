/**
 * Product analytics event map, as the desktop consumes it.
 *
 * The upstream package also carries a collector plugin, a remote Typert surface,
 * and locale files; those depend on host packages this repository does not have
 * yet, so this package exposes the event map alone.
 *
 * @module @qilin-agent/client-product-analytics
 */
export type * from './events.ts'
