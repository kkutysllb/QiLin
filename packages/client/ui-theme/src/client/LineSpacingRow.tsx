/**
 * Line-spacing preference row registered into the General section item slot:
 * the same cell rhythm as the font-size row, with a stepper pill carrying the
 * leading adjustment instead of an absolute size. The value is a signed px
 * delta over each tier's shipped line height, so 0 renders the typography the
 * theme ships. The displayed value follows the persisted setting, never the
 * click echo.
 */
import {
  IconChevronDownOutline14, IconChevronUpOutline14,
} from '@qilin/client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@qilin/client-ui-slots'
import { LEADING_MAX, LEADING_MIN } from '../theme-settings.ts'
import type {} from '@qilin/client-ui-settings/client'
import type { createTypographyRowStore } from './settings-store.ts'
import css from './settings-row.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface LineSpacingRowInjected {
  /** Change the content leading adjustment (integer px within LEADING_MIN..LEADING_MAX). */
  setLeading: (px: number) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type LineSpacingRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createTypographyRowStore>>
  & PropsLocale<'settings.theme'> & LineSpacingRowInjected

/**
 * Render the line-spacing row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function LineSpacingRow({ t, setLeading, useStore }: LineSpacingRowComponentProps) {
  const leading = useStore(s => s.leading)
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('leading.title')}</div>
        <div className={css.desc}>{t('leading.description')}</div>
      </div>
      <div className={css.control}>
        <div className={css.stepper}>
          <span className={css.value}>{leading > 0 ? `+${leading}` : `${leading}`}</span>
          <span className={css.arrows}>
            <button
              type="button"
              className={css.arrow}
              aria-label={t('leading.increase')}
              disabled={leading >= LEADING_MAX}
              onClick={() => { setLeading(leading + 1) }}
            >
              <IconChevronUpOutline14 size={9} />
            </button>
            <button
              type="button"
              className={css.arrow}
              aria-label={t('leading.decrease')}
              disabled={leading <= LEADING_MIN}
              onClick={() => { setLeading(leading - 1) }}
            >
              <IconChevronDownOutline14 size={9} />
            </button>
          </span>
        </div>
        <span className={css.unit}>{t('leading.unit')}</span>
      </div>
    </div>
  )
}
