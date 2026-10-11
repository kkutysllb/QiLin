/** Settings section showing one account the tokens it spent. */

import type { Context } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-locale/client'
import type {} from '@qilin-agent/client-ui-settings/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
import { en, NS, zh } from './locales.ts'
import { UsageSection } from './UsageSection.tsx'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Usage page copy. */
    usage: keyof typeof zh
  }
}

/** Services the page reads: the slot registry and its dictionaries. */
export const inject = ['slots', 'locale']

/** Order the Usage section takes among the settings sections. */
const ORDER = 25

/**
 * Register the usage page as a Settings section.
 * @param ctx - browser context carrying the slot registry and dictionaries.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-usage: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'usage',
    order: ORDER,
    label: () => t('nav'),
    locale: NS,
  }, UsageSection))
}
