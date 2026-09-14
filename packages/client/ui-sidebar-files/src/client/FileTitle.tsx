/**
 * The `file` type's chip title: the open file's type sheet before its basename.
 * Registered under `sidebar.right.pane.tab.title`. The glyph classifies the
 * captured title — the address's decoded basename — so each file carries its
 * own sheet, which is why the type declares no static `icon`.
 */
import type { ReactNode } from 'react'
import { FileTypeIcon } from '@qilin/client-ui-primitives'
import type { PropsRuntime } from '@qilin/client-ui-slots'
import css from './FilesBody.module.css'

/**
 * The title as the chip and a floating panel's header show it.
 * @param props - the tab information hook.
 * @returns the file's type sheet followed by its basename.
 */
export function FileTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return (
    <>
      <FileTypeIcon path={tab.title} size={16} className={css.titleIcon} />
      {tab.title}
    </>
  )
}
