/**
 * Sidebar-footer account button: the round trigger plus the menu that switches
 * theme and language, opens Settings, and signs out. The account facts come
 * from the menu store, live theme and locale state from the injected sources,
 * and every write goes through the injected callbacks — the component reaches
 * no service itself.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  IconCheckOutline16, IconDarkOutline16, IconFollowsystemOutline16, IconGlobeOutline14,
  IconLightOutline16, IconLogoutOutline16, IconPersonalizationOutline16, IconSettingsOutline16,
  IconUserOutline16, Menu, Tooltip,
} from '@qilin/client-ui-primitives'
import type { MenuEntry } from '@qilin/client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore,
} from '@qilin/client-ui-slots'
import type { LocaleSnapshot } from '@qilin/client-locale/client'
import type { ThemeSnapshot } from '@qilin/client-ui-theme/client'
import type { AccountLocaleKey } from './locales.ts'
import type { AccountMenuStoreHandle } from './store.ts'
import css from './AccountMenu.module.css'

/** Row id of the Settings entry. */
const SETTINGS_ID = 'settings'

/** Row id of the sign-out entry. */
const SIGN_OUT_ID = 'sign-out'

/** Prefix marking one theme option row; the remainder is the theme id. */
const THEME_ROW_PREFIX = 'theme:'

/** Prefix marking one language option row; the remainder is the locale id. */
const LOCALE_ROW_PREFIX = 'locale:'

/** One theme choice the submenu offers. */
interface ThemeRow {
  /** Preference id passed to the injected theme write. */
  readonly id: string
  /** Dictionary key of this row's own label. */
  readonly labelKey: AccountLocaleKey
  /** Leading glyph. */
  readonly Icon: typeof IconLightOutline16
}

/** The built-in theme preferences, in menu order. */
const THEME_ROWS: readonly ThemeRow[] = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutline16 },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutline16 },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutline16 },
]

/** Injected dependencies of {@link AccountMenu} (the plugin's inject face). */
export interface AccountMenuInjected {
  /** Read the account gate's status once and publish what it resolved. */
  loadAccount: () => Promise<void>
  /** End the session; a refused call navigates nowhere and leaves the menu open. */
  signOut: () => Promise<void>
  /** Reveal the settings panel. */
  openSettings: () => void
  /** Switch the theme preference to a built-in id. */
  setTheme: (id: string) => void
  /** Switch the active locale to a registered id. */
  setLocale: (id: string) => void
  hooks: {
    /** Theme state source, bound by the renderer as useTheme. */
    theme: HostObservable<ThemeSnapshot>
    /** Locale state source, bound by the renderer as useLocale. */
    locale: HostObservable<LocaleSnapshot>
    /** Settings-panel presence, bound by the renderer as useSettingsPanel. */
    settingsPanel: HostObservable<boolean>
  }
}

/** Full component props: sidebar column state, store share, inject face, and copy seat. */
export type AccountMenuProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsStore<AccountMenuStoreHandle>
  & InjectFace<AccountMenuInjected>
  & PropsLocale<'account'>

/**
 * Wrap one option row's label with its selection marker. The primitive draws
 * the check for the top-level rows named in `selectedIds` only, so a submenu
 * row that is the active choice carries its own.
 * @param label - the row's localized text.
 * @param selected - whether this row is the active choice.
 * @returns the row label node.
 */
function optionLabel(label: string, selected: boolean): ReactNode {
  return (
    <span className={css.option}>
      <span className={css.optionText}>{label}</span>
      {selected && <IconCheckOutline16 className={css.check} />}
    </span>
  )
}

/**
 * Render the account button and its dropdown.
 * @param props - composed slot props.
 * @returns the sidebar-footer trigger with its anchored menu.
 */
export function AccountMenu({
  wide, useStore, actions, loadAccount, signOut, openSettings, setTheme, setLocale,
  useTheme, useLocale, useSettingsPanel, t,
}: AccountMenuProps): ReactNode {
  const open = useStore(state => state.open)
  const email = useStore(state => state.email)
  const signOutAvailable = useStore(state => state.signOutAvailable)
  const settingsMounted = useSettingsPanel(mounted => mounted)
  const preference = useTheme(snapshot => snapshot.preference)
  const activeLocale = useLocale(snapshot => snapshot.active)
  const locales = useLocale(snapshot => snapshot.locales)

  // One read per mount. The entry's inject face is identity-stable for the
  // registration, so this effect runs once and never re-reads on a render.
  useEffect(() => { void loadAccount() }, [loadAccount])

  const selected: string[] = []
  const items: MenuEntry[] = []
  if (email !== null) items.push({ type: 'label', id: 'account', text: email })
  // A deployment that mounts no settings panel offers no Settings row: the row
  // is the panel's entry point, and nothing else would answer it.
  if (settingsMounted) items.push({ id: SETTINGS_ID, label: t('settings'), icon: <IconSettingsOutline16 /> })
  items.push({
    id: 'appearance',
    label: t('appearance'),
    icon: <IconPersonalizationOutline16 />,
    submenu: THEME_ROWS.map((row) => {
      const id = `${THEME_ROW_PREFIX}${row.id}`
      const isSelected = row.id === preference
      if (isSelected) selected.push(id)
      return { id, label: optionLabel(t(row.labelKey), isSelected), icon: <row.Icon /> }
    }),
  })
  items.push({
    id: 'language',
    label: t('language'),
    icon: <IconGlobeOutline14 />,
    submenu: locales.map((entry) => {
      const id = `${LOCALE_ROW_PREFIX}${entry.id}`
      const isSelected = entry.id === activeLocale
      if (isSelected) selected.push(id)
      return { id, label: optionLabel(entry.label, isSelected) }
    }),
  })
  if (signOutAvailable) {
    items.push({ type: 'separator', id: 'sign-out-separator' })
    items.push({ id: SIGN_OUT_ID, label: t('signOut'), icon: <IconLogoutOutline16 />, danger: true })
  }

  const select = (id: string): void => {
    if (id === SIGN_OUT_ID) {
      // The menu stays open: the session kept running unless the call ended it.
      void signOut()
      return
    }
    actions.setOpen(false)
    if (id === SETTINGS_ID) {
      openSettings()
      return
    }
    if (id.startsWith(THEME_ROW_PREFIX)) {
      setTheme(id.slice(THEME_ROW_PREFIX.length))
      return
    }
    // Every other row this menu builds is a language option.
    setLocale(id.slice(LOCALE_ROW_PREFIX.length))
  }

  const label = t('label')
  // The row reads as the account it belongs to: the signed-in address when the
  // gate reports one, otherwise the localized account label. The avatar shows
  // the address's first letter, or the generic user glyph while none is known.
  const accountName = email ?? label
  const initial = email === null ? undefined : Array.from(email)[0]?.toUpperCase()

  return (
    <Menu
      className={css.slot}
      open={open}
      align="end"
      side="top"
      portal
      items={items}
      selectedIds={selected}
      onSelect={select}
      onClose={() => { actions.setOpen(false) }}
      anchor={(
        <Tooltip label={label} delayMs={500} disabled={wide}>
          <button
            type="button"
            className={`${css.trigger} ${wide ? css.wide : css.rail}`}
            /* The rail has no visible text to name the button; the wide row is
               named by the account name it shows. */
            aria-label={wide ? undefined : label}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => { actions.setOpen(!open) }}
          >
            <span className={css.avatar} aria-hidden="true">
              {initial ?? <IconUserOutline16 size={14} />}
            </span>
            {wide && <span className={css.name}>{accountName}</span>}
          </button>
        </Tooltip>
      )}
    />
  )
}
