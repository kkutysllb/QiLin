/**
 * Stage one of the trajectory-graph tab type: what it IS in the right Sidebar.
 *
 * The type is a page, not a viewer: it claims no address. It opens by kind from
 * the guide page's entry box, and it sits beside the ledger type it draws.
 */
import type { TranslateNS } from '@qilin/client-locale/client'
import type { SidebarRightTabDefinition } from '@qilin/client-ui-sidebar-right/client'
import { IconShareOutline16 } from '@qilin/client-ui-primitives'

/** The tab kind this package owns under the graph implementation; ctx.sidebarRight.openTab names it. */
export const TRAJECTORY_GRAPH_KIND = 'trajectory-graph'

/** The graph implementation's identity in the tab system, and the key its body registers under. */
export const TRAJECTORY_GRAPH_ID = '@qilin/client-ui-trajectory/graph'

/**
 * The trajectory-graph type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns The definition to register.
 */
export function trajectoryGraphTabDefinition(
  t: TranslateNS<'trajectory'>,
): SidebarRightTabDefinition {
  return {
    id: TRAJECTORY_GRAPH_ID,
    kind: TRAJECTORY_GRAPH_KIND,
    priority: 'builtin',
    label: () => t('view.trajectoryGraph'),
    icon: IconShareOutline16,
    // One graph per surface, like the ledger it draws.
    single: true,
    title: () => t('view.trajectoryGraph'),
    guide: [{
      order: 21,
      title: () => t('view.trajectoryGraph'),
      description: () => t('guide.graphDescription'),
      icon: IconShareOutline16,
    }],
  }
}
