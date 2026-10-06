/**
 * The sidebar-top workbench switch seat: the mutual-hide switch between the
 * brand row and New Session. The shell renders the seat only while the column
 * is wide; the switch itself keeps the browser's list panel as its aria panel.
 */
import type { ReactNode } from 'react'
import { WorkbenchSwitch } from './rows/WorkbenchSwitch.tsx'
import type { WorkbenchSwitchSeatProps } from './contract/slots.ts'
import css from './WorkbenchSwitchSeat.module.css'

/**
 * Render the switch seat.
 * @param props - shell owner share (wide), the bound workbench selector hook,
 *   the switch callback, and the locale seat.
 * @returns the switch row, or null on the rail.
 */
export function WorkbenchSwitchSeat({ wide, useWorkbench, onWorkbenchSwitch, t }: WorkbenchSwitchSeatProps): ReactNode {
  const workbench = useWorkbench(state => state)
  if (!wide) return null
  return (
    <div className={css.seat}>
      <WorkbenchSwitch
        value={workbench.active}
        onChange={onWorkbenchSwitch}
        labels={{ general: t('workbench.general'), coding: t('workbench.coding') }}
        ariaLabel={t('workbench.tabs.aria')}
        panelId="workbench-list-panel"
      />
    </div>
  )
}
