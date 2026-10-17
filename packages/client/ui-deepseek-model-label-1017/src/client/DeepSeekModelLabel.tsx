/** Display-only release marking; the catalog and selected route remain unchanged. */
import type { PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
// Type-only: the model-label slot's owner data (provider, model, placement).
import type {} from '@qilin-agent/client-ui-model-selection/client'
import { Tag } from '@qilin-agent/client-ui-primitives'
import css from './DeepSeekModelLabel.module.css'

const MODEL_NAME = 'DeepSeek-V4.1-Flash'

/**
 * Render the fixed 1017 release label for recognized official Flash entries.
 * @param props - Provider and model identity plus the badge dictionary.
 * @returns The base name with a badge, or the untouched catalog name.
 */
export function DeepSeekModelLabel({ provider, model, t }:
  PropsRuntime<'conversation.input.model.label'> & PropsLocale<'deepseek-model-label-1017'>,
) {
  // The account route is inert in this fork (no account stack is composed); the
  // condition keeps upstream's two-route contract so a later port needs no edit.
  const official = provider.id === 'deepseek-account' || provider.id === 'deepseek-official'
  if (!official || model.id !== 'deepseek-flash' || model.name !== MODEL_NAME) return model.name
  return <span className={css.label}>
    <span>{model.name}</span>{' '}<Tag tone="info">{t('badge.label')}</Tag>
  </span>
}
