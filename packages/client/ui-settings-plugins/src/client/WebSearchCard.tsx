/**
 * The web-search settings page: the switch between Messages search and the
 * Search and Fetch APIs, the selected API's endpoint and per-search limit, and
 * the key — which is written through the credentials domain, never into the
 * settings section, so the literal never rides a response.
 */

import type {} from '@qilin-agent/client-ui-plugin-manager/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import { SettingsSecretField, SettingsValueField, Switch } from '@qilin-agent/client-ui-primitives'
import { PluginConfigForm } from './PluginConfigForm.tsx'
import styles from './WebSearchCard.module.css'
import type { WebSearchCardFace } from './web-search-card-controller.ts'

/** Props the renderer binds for the web-search page. */
export type WebSearchCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<WebSearchCardFace>

/**
 * Render the web-search provider's one-liner or its configuration form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export function WebSearchCard(props: WebSearchCardProps) {
  const { t } = props
  const state = props.useWebSearchCard(snapshot => snapshot)
  if (props.view === 'summary') return t('webSearchDescription')
  const disabled = !state.writable || state.saving
  const searchApi = state.useSearchApi
  const limitField = searchApi ? 'count' : 'maxUses'
  return (
    <PluginConfigForm
      t={t}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      {state.apiSwitchAvailable && (
        <div className={styles.feature}>
          <label className={styles.toggleRow}>
            <span>{t('webSearchUseApi')}</span>
            <Switch
              checked={searchApi}
              label={t('webSearchUseApi')}
              disabled={disabled || state.apiSwitchBlocked}
              onChange={(checked) => { props.setSearchApi(checked) }}
            />
          </label>
          <p className={styles.hint}>
            {t('webSearchUseApiHint')}
            <a className={styles.link} href={t('webSearchGuideUrl')} target="_blank" rel="noopener noreferrer">
              {t('webSearchGuide')}
            </a>
          </p>
        </div>
      )}
      <SettingsSecretField
        id="plugin-config-web-search-key"
        label={t('webSearchApiKey')}
        hint={t('webSearchApiKeyHint')}
        // The credentials domain accepts a key even when the settings document
        // itself is read-only; they are separate stores with separate refusals.
        // Its own writability is what disables this control — a key sourced
        // from the process environment cannot be written from here.
        disabled={!state.apiKeyWritable}
        text={state.apiKey.text}
        configured={state.apiKeyConfigured}
        stateLabel={state.apiKeyConfigured ? t('webSearchApiKeySet') : t('webSearchApiKeyUnset')}
        onEdit={(text) => { props.edit('apiKey', text) }}
      />
      <SettingsValueField
        id="plugin-config-web-search-endpoint"
        label={t(searchApi ? 'webSearchSearchApiBaseUrl' : 'webSearchBaseUrl')}
        hint={t(searchApi ? 'webSearchSearchApiBaseUrlHint' : 'webSearchBaseUrlHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        {...state.baseURL}
        onEdit={(text) => { props.edit('baseURL', text) }}
        onReset={() => { props.resetField('baseURL') }}
      />
      <SettingsValueField
        id={searchApi ? 'plugin-config-web-search-count' : 'plugin-config-web-search-max-uses'}
        label={t(limitField === 'count' ? 'webSearchCount' : 'webSearchMaxUses')}
        hint={t(searchApi ? 'webSearchCountHint' : 'webSearchMaxUsesHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t(searchApi ? 'webSearchInvalidCount' : 'invalidNumber')}
        numeric
        disabled={disabled}
        {...state[limitField]}
        onEdit={(text) => { props.edit(limitField, text) }}
        onReset={() => { props.resetField(limitField) }}
      />
    </PluginConfigForm>
  )
}
