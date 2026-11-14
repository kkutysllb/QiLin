/** The General section: one page intro over grouped cards. Half-width cards pair
 * up in two columns; the short footer groups render as full-width bars so the
 * width the two-column area leaves empty is used. */
import { Fragment } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, InjectFace } from '@qilin-agent/client-ui-slots'
import type { HostObservable } from '@qilin-agent/client-ui-slots'
import css from './GeneralSection.module.css'

/** One entry the item ledger holds; the shell only needs its identity and order. */
export interface GeneralItemRef {
  readonly id: string
  /** Registration order inside its card. */
  readonly order: number
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

type GroupKey = 'group.security' | 'group.appearance' | 'group.interaction' | 'group.about' | 'group.other'

/**
 * Grouping the shell owns. Each id is a registered item; ids the shell does not
 * know fall into 'other' so a new contribution still appears. Half cards fill a
 * two-column area; full cards render as bars beneath it.
 */
const SECTIONS: readonly { id: string; labelKey: GroupKey; span: 'half' | 'full' }[] = [
  { id: 'security', labelKey: 'group.security', span: 'half' },
  { id: 'appearance', labelKey: 'group.appearance', span: 'half' },
  { id: 'interaction', labelKey: 'group.interaction', span: 'half' },
  { id: 'about', labelKey: 'group.about', span: 'full' },
  { id: 'other', labelKey: 'group.other', span: 'full' },
]

/** Which group one item id belongs to. */
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
 * @returns the page intro, its two-column cards, and the full-width bars.
 */
export function GeneralSection({ renderSlot, t, useItems }: GeneralSectionComponentProps) {
  const items = useItems(snapshot => snapshot)
  const card = (section: { id: string; labelKey: GroupKey; span: 'half' | 'full' }) => {
    const ids = items
      .filter(item => (SECTION_OF[item.id] ?? 'other') === section.id)
      .sort((a, b) => a.order - b.order)
    if (ids.length === 0) return null
    const headingId = `settings-group-${section.id}`
    return (
      <section className={section.span === 'full' ? `${css.card} ${css.cardFull}` : css.card} key={section.id} aria-labelledby={headingId}>
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
  }
  return (
    <div className={css.section}>
      <header className={css.intro}>
        <h2 className={css.title}>{t('general.nav')}</h2>
        <p className={css.description}>{t('general.intro')}</p>
      </header>
      <div className={css.columns}>
        {SECTIONS.filter(section => section.span === 'half').map(section => card(section))}
      </div>
      <div className={css.bars}>
        {SECTIONS.filter(section => section.span === 'full').map(section => card(section))}
      </div>
    </div>
  )
}
