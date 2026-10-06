/**
 * The panels' shared toolbar reload affordance: the icon-only refresh button
 * (Git branch list, plans list, session lens). `onRefresh` is the panel's
 * own load function — the button carries no state.
 */
import { IconRefreshOutline16 } from '@qilin/client-ui-primitives'
import type { ReactNode } from 'react'
import { t } from './locales.ts'
import css from './sidebar.module.css'

export function RefreshButton(props: { onRefresh: () => void }): ReactNode {
  return (
    <button
      type="button"
      className={css.iconButton}
      aria-label={t('refresh')}
      title={t('refresh')}
      onClick={() => { props.onRefresh() }}
    >
      <IconRefreshOutline16 size={14} />
    </button>
  )
}
