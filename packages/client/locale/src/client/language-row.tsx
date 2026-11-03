/** The General settings language card: one self-named chip per registered locale. */
import { defineStore, type EngineStoreHandle } from '@qilin-agent/client-store'
import type { PropsLocale, PropsRuntime, PropsStore } from '@qilin-agent/client-ui-slots'
import type { LocaleDefinition } from './index.ts'
import css from './language-row.module.css'

/** Store state mirrored from the locale snapshot. */
export interface LanguageRowState {
  /** Active locale id. */
  active: string
  /** Registered locales in display order. */
  locales: readonly LocaleDefinition[]
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

type LanguageRowActions = {
  sync: (draft: LanguageRowState, active: string, locales: readonly LocaleDefinition[], revision: number) => void
}

/**
 * Declares the language card state and write surface.
 * @returns the store handle.
 */
export function createLanguageRowStore(): EngineStoreHandle<LanguageRowState, LanguageRowActions> {
  return defineStore({
    init: (): LanguageRowState => ({ active: '', locales: [], revision: -1 }),
    actions: {
      sync: (d, active: string, locales: readonly LocaleDefinition[], revision: number) => {
        if (revision <= d.revision) return
        d.active = active
        d.locales = locales
        d.revision = revision
      },
    },
  })
}

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface LanguageRowInjected {
  /** Switch the active locale. */
  setLocale: (id: string) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type LanguageRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createLanguageRowStore>>
  & PropsLocale<'settings.locale'> & LanguageRowInjected

/**
 * Render the language card: one self-named chip per registered locale.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function LanguageRow({ t, setLocale, useStore }: LanguageRowComponentProps) {
  const active = useStore(s => s.active)
  const locales = useStore(s => s.locales)
  return (
    <div className={css.group}>
      <div className={css.title}>{t('title')}</div>
      <div className={css.chipRow} role="group" aria-label={t('title')}>
        {locales.map(option => (
          <button
            key={option.id}
            type="button"
            className={active === option.id ? `${css.chip} ${css.selected}` : css.chip}
            aria-pressed={active === option.id}
            onClick={() => { setLocale(option.id) }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
