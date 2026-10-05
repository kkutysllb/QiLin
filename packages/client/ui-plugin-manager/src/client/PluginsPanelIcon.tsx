/** Decorative occupant for the plugin-manager sidebar entry. */
import type { PropsRuntime } from '@qilin/client-ui-slots'
import { IconPluginPinwheelOutline16 } from '@qilin/client-ui-primitives'
import type {} from '@qilin/client-ui-sidebar/client'

/**
 * Render the plugin glyph at the size the sidebar asks for; the sidebar owns
 * its accessible navigation label. The glyph declares itself decorative
 * inline because the shared primitive carries no implicit aria-hidden.
 * @param props - the sidebar's icon share: the requested edge and whether the panel is selected.
 * @returns decorative plugin icon.
 */
export function PluginsPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconPluginPinwheelOutline16 size={size} />
}
