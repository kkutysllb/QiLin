/**
 * Video previews stream from the host media route: the `<video>` element
 * fetches its own bytes with HTTP Range requests (the route answers 206
 * windows), so scrubbing works and the file never counts against the
 * whole-file cap. The player is a few KB — no lazy chunk.
 */
import type { Context } from '@qilin-agent/kylin'
import type {} from '../index.ts'
import { VideoBody } from './VideoBody.tsx'
import { en, zh } from './locales.ts'

/** Video extensions the viewer claims; `ts` is NOT claimed (TypeScript collision; `m2ts` covers MPEG-TS). */
export const VIDEO_EXTENSIONS = [
  'mp4', 'webm', 'mov', 'qt', 'm4v', 'mkv', 'avi', 'wmv', 'flv',
  'ogv', 'ogg', 'mpeg', 'mpg', '3gp', '3g2', 'm2ts',
] as const

/**
 * Register the browser video viewer and its lifecycle-owned slot.
 * @param ctx - Preview and locale registries.
 */
export function apply(ctx: Context): void {
  const id = '@qilin-agent/client-ui-sidebar-documentpreview/video'
  ctx.effect(() => ctx.locale.register('sidebarVideo', { zh, en }))
  const t = ctx.locale.bind('sidebarVideo')
  ctx.effect(() => ctx.documentPreviews.register({
    id, extensions: [...VIDEO_EXTENSIONS], priority: 'builtin',
    title: () => t('title'), loading: 'renderer', wrap: false,
  }))
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: id, locale: 'sidebarVideo' }, VideoBody,
  )))
}
