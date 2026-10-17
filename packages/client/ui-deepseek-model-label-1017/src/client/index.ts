/** Temporary 1017 badge beside the official DeepSeek Flash model labels. */
import type { Context as ClientContext } from '@qilin-agent/kylin'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and LocaleFace.
import type {} from '@qilin-agent/client-locale/client'
// Type-only: pulls the composer model-label slot and its owner data.
import type {} from '@qilin-agent/client-ui-model-selection/client'
// Type-only: pulls the renderer-owned slots service.
import type {} from '@qilin-agent/client-ui-renderer/client'
import { DeepSeekModelLabel } from './DeepSeekModelLabel.tsx'
import { en, NS, zh, type LabelKey } from './locales.ts'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The temporary model release badge. */
    'deepseek-model-label-1017': LabelKey
  }
}

/** Required services: model-label registration and localized badge text. */
export const inject = ['slots', 'locale']

/**
 * Decorate existing model labels while their declaring slot is mounted.
 * @param ctx - Client plugin context owning the dictionaries and registration.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'deepseek-model-label-1017: dictionaries')
  ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register({
    name: 'conversation.input.model.label', locale: NS,
  }, DeepSeekModelLabel))
}
