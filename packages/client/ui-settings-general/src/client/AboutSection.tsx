/** Shell-owned About page for the QiLin settings surface. */
import type { PropsLocale, PropsRenderSlots, PropsRuntime } from '@qilin/client-ui-slots'
import css from './AboutSection.module.css'

/** Props for the About settings section and its brand-mark child slot. */
export type AboutSectionComponentProps =
  PropsRuntime<'settings.section'>
  & PropsRenderSlots<'settings.about.mark'>
  & PropsLocale<'settings'>

/**
 * Render the project introduction without reading runtime services or settings.
 * @param props - section owner, brand-mark render share, and localized copy.
 * @returns the About page element tree.
 */
export function AboutSection({ renderSlot, t }: AboutSectionComponentProps) {
  return (
    <article className={css.section}>
      <div className={css.mark} role="img" aria-label={t('about.logoLabel')}>
        {renderSlot('settings.about.mark', { size: 72 }, {
          fallback: <span className={css.fallbackMark}>{t('about.logoMark')}</span>,
        })}
      </div>
      <div className={css.copy}>
        <h2>{t('about.title')}</h2>
        <p>{t('about.description')}</p>
        <p className={css.signature}>{t('about.signature')}</p>
      </div>
    </article>
  )
}
