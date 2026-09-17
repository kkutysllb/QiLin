/**
 * The Sidebar's settings page: one switch per registered tab type.
 *
 * The row's name is the type's own `label`, not the title of any open tab, so
 * a type that names its tabs after their content still reads as itself here.
 * The list is the registry's, so a type shipped from another package appears
 * without an edit to this file, and a type registered after this page was
 * built appears on the next commit.
 *
 * A switch decides what the Sidebar offers: a turned-off type loses its guide
 * entry and refuses new opens, while tabs already open keep rendering. Nothing
 * is closed behind the user's back.
 */
import type { ReactNode } from 'react'
import { Switch } from '@qilin/client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@qilin/client-ui-slots'
import type { SidebarRightTabDefinition } from '../../tab-registry.ts'
import css from './TabSettingsSection.module.css'

/** What this section needs beyond the framework shares. */
export interface TabSettingsSectionInjected {
  readonly hooks: {
    /** Every registered type in force, oldest registration first. */
    readonly tabTypes: HostObservable<readonly SidebarRightTabDefinition[]>
  }
  /** Turn one type on or off; the registry persists through its own subscriber. */
  readonly setEnabled: (id: string, enabled: boolean) => void
  /** Whether a type is offered right now. */
  readonly isEnabled: (id: string) => boolean
}

/** The section's props: the settings shell's owner share, copy, and this package's face. */
export type TabSettingsSectionProps =
  & PropsRuntime<'settings.section'>
  & PropsLocale<'sidebarRight'>
  & InjectFace<TabSettingsSectionInjected>

/**
 * Render the tab-type switches.
 * @param props - the four framework shares plus the registry face.
 * @returns the section.
 */
export function TabSettingsSection({ useTabTypes, setEnabled, isEnabled, t }: TabSettingsSectionProps): ReactNode {
  // Reading the list is also the subscription: a registration or a switch
  // republishes it, and this page follows.
  const types = useTabTypes(list => list)
  return (
    <section className={css.section} data-sidebar-right-settings>
      <h2 className={css.title}>{t('settings.title')}</h2>
      <p className={css.hint}>{t('settings.hint')}</p>
      <ul className={css.list}>
        {types.map(definition => (
          <li key={definition.id} className={css.row} data-sidebar-right-settings-row={definition.kind}>
            <span className={css.rowIcon}>
              {definition.icon === undefined ? null : <definition.icon size={16} />}
            </span>
            <span className={css.rowLabel}>{definition.label?.() ?? definition.kind}</span>
            <Switch
              label={definition.label?.() ?? definition.kind}
              checked={isEnabled(definition.id)}
              onChange={(enabled) => { setEnabled(definition.id, enabled) }}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
