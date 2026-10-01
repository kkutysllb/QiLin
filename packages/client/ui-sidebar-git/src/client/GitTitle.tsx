/**
 * The git type's chip title: the branch glyph before the type's label.
 * Registered under `sidebar.right.pane.tab.title`; without it the chip would
 * show the bare label.
 */
import type { ReactNode } from 'react'
import { IconBranchOutline16 } from '@qilin/client-ui-primitives'
import type { PropsRuntime } from '@qilin/client-ui-slots'
import css from './GitBody.module.css'

/**
 * The title as the chip and a floating panel's header show it.
 * @param props - the tab information hook.
 * @returns the branch glyph followed by the tab's title text.
 */
export function GitTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return (
    <>
      <IconBranchOutline16 size={16} className={css.titleIcon} />
      {tab.title}
    </>
  )
}
