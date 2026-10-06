/**
 * The QiLin seal slot occupants. The drawing itself lives in
 * `@qilin/client-ui-primitives` so the shell's unbranded fallbacks render the
 * same stamp; this module owns the brand slots that place it.
 */

import type { HeroBrandMarkOwnerProps } from '@qilin/client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@qilin/client-ui-sidebar/client'
import { QilinSeal } from '@qilin/client-ui-primitives'

export { QilinSeal as QilinSealArtist } from '@qilin/client-ui-primitives'

/**
 * Occupy the sidebar brand-mark slot.
 * @param props - host-supplied mark presentation.
 * @returns the seal at the sidebar's requested size.
 */
export function QilinSealMark({ size }: SidebarBrandMarkOwnerProps) {
  return <QilinSeal size={size} />
}

/**
 * Occupy the conversation hero's brand-mark slot.
 * @param props - host-supplied mark presentation.
 * @returns the seal at the hero's requested size and placement class.
 */
export function QilinSealHeroMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <QilinSeal size={size} className={className} />
}
