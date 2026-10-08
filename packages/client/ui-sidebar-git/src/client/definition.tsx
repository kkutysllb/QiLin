/**
 * Stage one of this package's registration: what the `git` tab type IS.
 *
 * The type is a page, not a viewer: it claims no address. The guide page
 * offers it as an entry box, and every section inside works on the session's
 * workspace through the `workspaceGit` Remote namespace.
 */
import type { SidebarRightTabDefinition } from '@qilin-agent/client-ui-sidebar-right/client'
import type { TranslateNS } from '@qilin-agent/client-ui-slots'
import { IconBranchOutline16, type IconProps } from '@qilin-agent/client-ui-primitives'
import type {} from './locales.ts'

/** The tab kind this package owns. */
export const GIT_KIND = 'git'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const GIT_ID = '@qilin-agent/client-ui-sidebar-git'

/** The type's branch glyph at whatever size the drawing surface asks for. */
function BranchGlyph({ size, className }: IconProps) {
  return <IconBranchOutline16 size={size} className={className} />
}

/**
 * The git type's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function gitDefinition(t: TranslateNS<'sidebarGit'>): SidebarRightTabDefinition {
  return {
    id: GIT_ID,
    kind: GIT_KIND,
    priority: 'builtin',
    label: () => t('type.label'),
    icon: BranchGlyph,
    // One panel per surface: opening the type again focuses the panel the
    // user already has rather than seating a second one.
    single: true,
    title: () => t('type.label'),
    guide: [{
      id: 'git',
      order: 20,
      title: () => t('guide.title'),
      description: () => t('guide.description'),
      icon: BranchGlyph,
    }],
  }
}
