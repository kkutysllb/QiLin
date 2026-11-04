/** Preserve existing tab-menu extensions under the clicked Session's retained scope. */
import type { InjectFace, PropsRenderSlots, PropsRuntime } from '@qilin-agent/client-ui-slots'
import type { ObservableSnapshot } from '@qilin-agent/client-store'
import type { SidebarSessionViewSnapshot } from '../session-views.ts'

type Props = PropsRuntime<'contextMenu.content'> & PropsRenderSlots<'sidebar.right.tab.menu.item'> & InjectFace<{
  hooks: { views: ObservableSnapshot<readonly SidebarSessionViewSnapshot[]> }
}>

/**
 * Existing tab-menu extension rows for one clicked tab.
 * @param props - the clicked target, the retained Session views, and the child seat.
 * @returns the registered rows, or nothing outside a tab target or without its retained view.
 */
export function TabMenuContent({ target, dismiss, useViews, SessionProvider, renderSlot }: Props) {
  const views = useViews(value => value)
  if (target.kind !== 'tab') return null
  const view = views.find(view => view.sessionId === target.value.sessionId)
  const tab = target.value.tab
  if (view === undefined) return null
  return <SessionProvider session={view.reference}>
    {renderSlot('sidebar.right.tab.menu.item', { tab, dismiss })}
  </SessionProvider>
}
