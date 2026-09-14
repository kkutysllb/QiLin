/**
 * Stage one of this package's registration: what the `plans` tab type IS.
 *
 * The type is a page, not a viewer: it claims no address. The guide page
 * offers it as an entry box, and each row opens its document through
 * `tabActions.openResource` for the `qilin-resource://file` viewers to claim.
 */
import type { SidebarRightTabDefinition } from '@qilin/client-ui-sidebar-right/client'
import type { TranslateNS } from '@qilin/client-ui-slots'
import { IconChecklistOutline14, type IconProps } from '@qilin/client-ui-primitives'
import type {} from './locales.ts'

/** The tab kind this package owns. */
export const PLANS_KIND = 'plans'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const PLANS_ID = '@qilin/client-ui-sidebar-plans'

/** The type's checklist glyph at whatever size the drawing surface asks for. */
function ChecklistGlyph({ size, className }: IconProps) {
  return <IconChecklistOutline14 size={size} className={className} />
}

/**
 * The plans type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function plansDefinition(t: TranslateNS<'sidebarPlans'>): SidebarRightTabDefinition {
  return {
    id: PLANS_ID,
    kind: PLANS_KIND,
    priority: 'builtin',
    label: () => t('type.label'),
    icon: ChecklistGlyph,
    // One plan list per surface: opening the type again focuses the list the
    // user already has rather than seating a second one.
    single: true,
    title: () => t('type.label'),
    guide: [{
      order: 50,
      title: () => t('guide.title'),
      description: () => t('guide.description'),
      icon: ChecklistGlyph,
    }],
  }
}
