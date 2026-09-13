/**
 * Stage one of the trajectory tab type: what it IS in the right Sidebar.
 *
 * The type is a page, not a viewer: it claims no address. It opens by kind —
 * from the guide page's entry box, or from a Chat tool card's inspect action,
 * which addresses the call to focus through `params.focus`.
 */
import type { SidebarRightTabDefinition } from '@qilin/client-ui-sidebar-right/client'
import type { TranslateNS } from '@qilin/client-locale/client'
import { IconGaugeOutline16 } from '@qilin/client-ui-primitives'

/** The tab kind this package owns; `ctx.sidebarRight.openTab` names it. */
export const TRAJECTORY_KIND = 'trajectory'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const TRAJECTORY_ID = '@qilin/client-ui-trajectory/trajectory'

/** Navigation parameters the trajectory page accepts: the tool-call identity to focus. */
export interface TrajectoryTabParams {
  readonly focus?: string
}

declare module '@qilin/client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** The trajectory page focuses the ledger on this call when opened from Chat. */
    trajectory: TrajectoryTabParams
  }
}

/**
 * The trajectory type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function trajectoryTabDefinition(t: TranslateNS<'trajectory'>): SidebarRightTabDefinition {
  return {
    id: TRAJECTORY_ID,
    kind: TRAJECTORY_KIND,
    priority: 'builtin',
    title: () => t('view.trajectory'),
    guide: [{
      order: 20,
      title: () => t('view.trajectory'),
      description: () => t('guide.description'),
      icon: IconGaugeOutline16,
    }],
  }
}
