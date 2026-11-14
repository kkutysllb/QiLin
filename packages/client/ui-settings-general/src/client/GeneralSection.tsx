/** The General section: one page intro over grouped cards, each card owning the
 * feature contributions that belong to it. */
import { Fragment } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, InjectFace } from '@qilin-agent/client-ui-slots'
import type { HostObservable } from '@qilin-agent/client-ui-slots'
import css from './GeneralSection.module.css'

/** One entry the item ledger holds; the shell only needs its identity. */
export interface GeneralItemRef {
  readonly id: string
}

/** Registrant-owned injected face: the item ledger, read as a bare observable. */
export interface GeneralSectionInjected {
  hooks: {
    /** Registered item identities bound by the UI renderer as useItems. */
    items: HostObservable<readonly GeneralItemRef[]>
  }
}

/** Full component props: owner share, item render share, locale seat, injected ledger. */
export type GeneralSectionComponentProps =
  PropsRuntime<'settings.section'> & PropsRenderSlots<'settings.general.item'> & PropsLocale<'settings'>
  & InjectFace<GeneralSectionInjected>

/**
 * Grouping the shell owns. Each id is a registered item; ids the shell does not
 * know fall into `other` so a new contribution still appears. A card whose ids
 * never resolve renders nothing.
 */
const SECTIONS: readonly { id: string; labelKey: 'group.security' | 'group.appearance' | 'group.interaction' | 'group.about' | 'group.other' }[] = [
  { id: 'security', labelKey: 'group.security' },
  { id: 'appearance', labelKey: 'group.appearance' },
  { id: 'interaction', labelKey: 'group.interaction' },
  { id: 'about', labelKey: 'group.about' },
  { id: 'other', labelKey: 'group.other' },
]

/** Which card one item id belongs to. */
const SECTION_OF: Readonly<Record<string, string>> = {
  permission: 'security',
  'developer-tools': 'security',
  appearance: 'appearance',
  'font-size': 'appearance',
  language: 'interaction',
  'link-opening': 'interaction',
  shortcuts: 'interaction',
  'performance-usage': 'interaction',
  'current-version': 'about',
}

/**
 * Render the General section content column.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the page intro and its grouped cards.
 */
export function GeneralSection({ renderSlot, t, useItems }: GeneralSectionComponentProps) {
  const items = useItems(snapshot => snapshot)
  return (
    <div className={css.section}>
      <header className={css.intro}>
        <h2 className={css.title}>{t('general.nav')}</h2>
        <p className={css.description}>{t('general.intro')}</p>
      </header>
      <div className={css.grid}>
        {SECTIONS.map((section) => {
          const ids = items.filter(item => (SECTION_OF[item.id] ?? 'other') === section.id)
          if (ids.length === 0) return null
          const headingId = `settings-group-${section.id}`
          return (
            <section className={css.card} key={section.id} aria-labelledby={headingId}>
              <h3 className={css.cardTitle} id={headingId}>{t(section.labelKey)}</h3>
              <div className={css.rows}>
                {ids.map(item => (
                  <Fragment key={item.id}>
                    {renderSlot('settings.general.item', {}, { only: item.id })}
                  </Fragment>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
