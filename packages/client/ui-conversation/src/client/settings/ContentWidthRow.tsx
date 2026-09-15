/**
 * General Settings row for the transcript content width. The pill carries the
 * persisted width — the word for the adaptive column clamp, otherwise the px
 * value — and steps it by CONTENT_WIDTH_STEP. Reverting to the clamp is an
 * explicit action, never a stepper bound.
 */
import type { SnapshotStore } from '@qilin/client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin/client-ui-slots'
import { IconChevronDownOutline14, IconChevronUpOutline14 } from '@qilin/client-ui-primitives'
import {
  CONTENT_WIDTH_ADAPTIVE, CONTENT_WIDTH_MAX, CONTENT_WIDTH_MIN, CONTENT_WIDTH_STEP,
} from '../../conversation-settings.ts'
import css from './ContentWidthRow.module.css'

/** Registration-side preference face. */
export interface ContentWidthRowInjected {
  hooks: {
    /** Persisted transcript width bound as useContentWidth. */
    contentWidth: SnapshotStore<number>
  }
  /** Persist a width, or {@link CONTENT_WIDTH_ADAPTIVE} to return to the adaptive clamp. */
  setContentWidth: (px: number) => void
}

/** Full Settings-row props. */
export type ContentWidthRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'conversation'>
  & InjectFace<ContentWidthRowInjected>

/**
 * Render the transcript width row.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function ContentWidthRow({ t, useContentWidth, setContentWidth }: ContentWidthRowProps) {
  const width = useContentWidth(value => value)
  const adaptive = width === CONTENT_WIDTH_ADAPTIVE
  const shown = adaptive ? t('settings.width.adaptive') : `${width}`
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.width.title')}</div>
        <div className={css.desc}>{t('settings.width.description')}</div>
      </div>
      <div className={css.control}>
        <div className={css.stepper}>
          <span className={css.value}>{shown}</span>
          <span className={css.arrows}>
            <button
              type="button"
              className={css.arrow}
              aria-label={t(adaptive ? 'settings.width.customize' : 'settings.width.increase')}
              disabled={width >= CONTENT_WIDTH_MAX}
              onClick={() => { setContentWidth(adaptive ? CONTENT_WIDTH_MIN : width + CONTENT_WIDTH_STEP) }}
            >
              <IconChevronUpOutline14 size={9} />
            </button>
            <button
              type="button"
              className={css.arrow}
              aria-label={t('settings.width.decrease')}
              disabled={adaptive || width <= CONTENT_WIDTH_MIN}
              onClick={() => { setContentWidth(width - CONTENT_WIDTH_STEP) }}
            >
              <IconChevronDownOutline14 size={9} />
            </button>
          </span>
        </div>
        {adaptive
          ? null
          : <span className={css.unit}>{t('settings.width.unit')}</span>}
        {adaptive
          ? null
          : <button type="button" className={css.reset} onClick={() => { setContentWidth(CONTENT_WIDTH_ADAPTIVE) }}>
            {t('settings.width.reset')}
          </button>}
      </div>
    </div>
  )
}
