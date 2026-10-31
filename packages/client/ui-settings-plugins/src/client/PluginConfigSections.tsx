/**
 * Standalone Settings pages for the runtime plugins this package configures.
 *
 * Subagent, the Agent loop, and Web search configure process-wide runtime
 * behaviour, so each owns a Settings navigation entry instead of a card inside
 * the plugin list. The pages reuse the configuration cards verbatim — the card
 * is the surface, the section supplies only the page chrome.
 */

import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import type {} from '@qilin-agent/client-ui-settings/client'
import { AgentLoopCard } from './AgentLoopCard.tsx'
import type { AgentLoopCardFace } from './agent-loop-card-controller.ts'
import { SubagentCard } from './SubagentCard.tsx'
import type { SubagentCardFace } from './subagent-card-controller.ts'
import { WebSearchCard } from './WebSearchCard.tsx'
import type { WebSearchCardFace } from './web-search-card-controller.ts'
import type { PluginsSettingsLocaleKey } from './locales.ts'
import css from './PluginConfigSections.module.css'

/** Chrome every configuration page shares: the section title and its one-liner. */
interface PageChromeProps {
  t: PropsLocale<'settings.plugins'>['t']
  title: PluginsSettingsLocaleKey
  intro: PluginsSettingsLocaleKey
  children: ReactNode
}

/**
 * Render one configuration page around a plugin card.
 * @param props - locale reader, the two copy keys, and the card.
 * @returns the section page.
 */
function ConfigPage({ t, title, intro, children }: PageChromeProps) {
  return (
    <div className={css.page}>
      <h2 className={css.heading}>{t(title)}</h2>
      <p className={css.intro}>{t(intro)}</p>
      {children}
    </div>
  )
}

/** Props the renderer binds for the Agent loop page. */
export type AgentLoopSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<AgentLoopCardFace>

/**
 * Render the Agent loop configuration as its own Settings page.
 * @param props - the section's locale reader and the card face.
 * @returns the page.
 */
export function AgentLoopSettingsSection(props: AgentLoopSettingsSectionProps) {
  const { t, close: _close, ...face } = props
  return (
    <ConfigPage t={t} title="agentLoopTitle" intro="agentLoopDescription">
      <AgentLoopCard t={t} view="page" {...face} />
    </ConfigPage>
  )
}

/** Props the renderer binds for the Subagent page. */
export type SubagentSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<SubagentCardFace>

/**
 * Render the Subagent configuration as its own Settings page.
 * @param props - the section's locale reader and the card face.
 * @returns the page.
 */
export function SubagentSettingsSection(props: SubagentSettingsSectionProps) {
  const { t, close: _close, ...face } = props
  return (
    <ConfigPage t={t} title="subagentTitle" intro="subagentDescription">
      <SubagentCard t={t} view="page" {...face} />
    </ConfigPage>
  )
}

/** Props the renderer binds for the Web search page. */
export type WebSearchSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<WebSearchCardFace>

/**
 * Render the Web search provider as its own Settings page.
 * @param props - the section's locale reader and the card face.
 * @returns the page.
 */
export function WebSearchSettingsSection(props: WebSearchSettingsSectionProps) {
  const { t, close: _close, ...face } = props
  return (
    <ConfigPage t={t} title="webSearchTitle" intro="webSearchDescription">
      <WebSearchCard t={t} view="page" {...face} />
    </ConfigPage>
  )
}
