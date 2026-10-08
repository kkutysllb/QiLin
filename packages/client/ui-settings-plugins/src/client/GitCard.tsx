/** The Git plugin's configuration page: the binaries and limits every repository and pull-request call is bound by. */

import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import { ValueField } from './fields.tsx'
import { PluginConfigForm } from './PluginConfigForm.tsx'
import type { GitCardFace } from './git-card-controller.ts'

/** Props the renderer binds for the Git page. */
export type GitCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<GitCardFace>

/**
 * Render the Git plugin's one-liner or its configuration form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export function GitCard(props: GitCardProps) {
  const { t } = props
  const state = props.useGitCard(snapshot => snapshot)
  if (props.view === 'summary') return t('gitDescription')
  const disabled = !state.writable
  const shared = {
    overriddenLabel: t('overridden'),
    resetLabel: t('reset'),
    invalidLabel: t('invalidNumber'),
    disabled,
  }
  return (
    <PluginConfigForm
      t={t}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <ValueField
        id="plugin-config-git-bin"
        label={t('gitBin')}
        hint={t('gitBinHint')}
        {...shared}
        {...state.gitBin}
        onEdit={(text) => { props.edit('gitBin', text) }}
        onReset={() => { props.resetField('gitBin') }}
      />
      <ValueField
        id="plugin-config-gh-bin"
        label={t('ghBin')}
        hint={t('ghBinHint')}
        {...shared}
        {...state.ghBin}
        onEdit={(text) => { props.edit('ghBin', text) }}
        onReset={() => { props.resetField('ghBin') }}
      />
      <ValueField
        id="plugin-config-git-timeout"
        label={t('gitTimeoutMs')}
        hint={t('gitTimeoutMsHint')}
        numeric
        {...shared}
        {...state.timeoutMs}
        onEdit={(text) => { props.edit('timeoutMs', text) }}
        onReset={() => { props.resetField('timeoutMs') }}
      />
      <ValueField
        id="plugin-config-git-discovery-timeout"
        label={t('gitDiscoveryTimeoutMs')}
        hint={t('gitDiscoveryTimeoutMsHint')}
        numeric
        {...shared}
        {...state.discoveryTimeoutMs}
        onEdit={(text) => { props.edit('discoveryTimeoutMs', text) }}
        onReset={() => { props.resetField('discoveryTimeoutMs') }}
      />
      <ValueField
        id="plugin-config-gh-timeout"
        label={t('ghTimeoutMs')}
        hint={t('ghTimeoutMsHint')}
        numeric
        {...shared}
        {...state.ghTimeoutMs}
        onEdit={(text) => { props.edit('ghTimeoutMs', text) }}
        onReset={() => { props.resetField('ghTimeoutMs') }}
      />
      <ValueField
        id="plugin-config-git-max-diff"
        label={t('gitMaxDiffBytes')}
        hint={t('gitMaxDiffBytesHint')}
        numeric
        {...shared}
        {...state.maxDiffBytes}
        onEdit={(text) => { props.edit('maxDiffBytes', text) }}
        onReset={() => { props.resetField('maxDiffBytes') }}
      />
      <ValueField
        id="plugin-config-git-max-stderr"
        label={t('gitMaxStderrChars')}
        hint={t('gitMaxStderrCharsHint')}
        numeric
        {...shared}
        {...state.maxStderrChars}
        onEdit={(text) => { props.edit('maxStderrChars', text) }}
        onReset={() => { props.resetField('maxStderrChars') }}
      />
      <ValueField
        id="plugin-config-git-max-list"
        label={t('gitMaxListEntries')}
        hint={t('gitMaxListEntriesHint')}
        numeric
        {...shared}
        {...state.maxListEntries}
        onEdit={(text) => { props.edit('maxListEntries', text) }}
        onReset={() => { props.resetField('maxListEntries') }}
      />
    </PluginConfigForm>
  )
}
