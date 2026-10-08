/** Live Browser tab title from the Browser store. */
import type { ReactNode } from 'react'
import { IconGlobeOutline14 } from '@qilin-agent/client-ui-primitives'
import type { PropsRuntime, PropsStore } from '@qilin-agent/client-ui-slots'
import { BrowserNavigation } from '../browser/BrowserNavigation.ts'
import type { BrowserStore } from '../browser/store.ts'
import css from './Browser.module.css'

/** Browser title props assembled by the Sidebar title seat. */
export type BrowserTitleProps = PropsRuntime<'sidebar.right.pane.tab.title'> & PropsStore<BrowserStore>

/**
 * Browser icon and current host name.
 * @param props - composed slot props for the Browser tab title.
 * @returns the icon and the current host name.
 */
export function BrowserTitle(props: BrowserTitleProps): ReactNode {
  const { useTabInfo, useStore } = props
  const { tab } = useTabInfo()
  const entry = useStore(state => BrowserNavigation.current(state.byTab[tab.id]))
  return <><IconGlobeOutline14 className={css.titleIcon} />{entry?.title ?? tab.title}</>
}
