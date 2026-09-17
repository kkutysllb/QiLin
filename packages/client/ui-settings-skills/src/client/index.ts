/** Skills settings page for the Web client. */

import type { Context as ClientContext } from '@qilin/kylin'
import type {} from '@qilin/client-locale/client'
import type {} from '@qilin/client-ui-settings/client'
import type {} from '@qilin/client-ui-renderer/client'
// Type-only: pulls the ctx.remote merge, the skills Remote row, and the
// workspace global-prop merge this page reads its Session selection from.
import type {} from '@qilin/api-remotes/client'
import type {} from '@qilin/client-ui-workspace/client'
import { SkillsSection } from './SkillsSection.tsx'
import type { SkillsSectionInjected } from './SkillsSection.tsx'
import { SkillsStore } from './store.ts'
import { en, zh, type SkillsLocaleKey } from './locales.ts'

export type { SkillsSectionInjected, SkillsSectionProps } from './SkillsSection.tsx'
export type { SkillsPageState, SkillsStore } from './store.ts'
export type { SkillsLocaleKey } from './locales.ts'

declare module '@qilin/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skills page copy. */
    'settings.skills': SkillsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.skills'

/** Services required by the settings registration and the generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.skills', 'uiWorkspace']

/**
 * Register the skills page once the settings shell declares its section slot,
 * and hand it the one store every mount shares.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-skills: copy dictionaries')

  const controller = new SkillsStore(ctx)
  const t = ctx.locale.bind(NS) as SkillsSectionInjected['t']
  const injected = (): SkillsSectionInjected => ({
    controller,
    hooks: { snapshot: controller.store, selection: ctx.uiWorkspace.selection },
    t,
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'skills',
    order: 30,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, SkillsSection))
}
