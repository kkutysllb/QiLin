/**
 * What the `session-changes` tab type IS: a page listing every file the
 * Session's recorded turns changed, grouped by directory. Like the Git panel
 * it claims no address — the guide page offers it as an entry box, and the
 * body works on the viewed Session.
 */
import type { SidebarRightTabDefinition } from '@qilin/client-ui-sidebar-right/client'
import type { TranslateNS } from '@qilin/client-ui-slots'
import { IconCodeOutline16, type IconProps } from '@qilin/client-ui-primitives'
import type {} from './locales.ts'
import type { NS } from './locales.ts'

/** The tab kind this package owns. */
export const SESSION_CHANGES_KIND = 'session-changes'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const SESSION_CHANGES_ID = '@qilin/client-ui-deliverables/changes'

/** The type's change glyph at whatever size the drawing surface asks for. */
function ChangesGlyph({ size, className }: IconProps) {
  return <IconCodeOutline16 size={size} className={className} />
}

/**
 * The Session changes type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function sessionChangesDefinition(t: TranslateNS<typeof NS>): SidebarRightTabDefinition {
  return {
    id: SESSION_CHANGES_ID,
    kind: SESSION_CHANGES_KIND,
    priority: 'builtin',
    label: () => t('session.title'),
    icon: ChangesGlyph,
    // One panel per Session view: opening the type again focuses the panel the
    // user already has rather than seating a second one.
    single: true,
    title: () => t('session.title'),
    guide: [{
      id: 'changes',
      order: 35,
      title: () => t('session.title'),
      description: () => t('session.description'),
      icon: ChangesGlyph,
    }],
  }
}
