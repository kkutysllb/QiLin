/**
 * The QiLin seal: a rounded-square frame with 麒 above 麟, drawn from outlines
 * embedded as path data. The mark inherits `currentColor` from its host
 * surface, so one definition serves every theme.
 */

import type { HeroBrandMarkOwnerProps } from '@qilin/client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@qilin/client-ui-sidebar/client'
import { SEAL_GLYPH_LIN, SEAL_GLYPH_QI } from './glyphs.ts'

/** Frame square, its corner radius, and the stroke that draws the seal body. */
const SEAL_FRAME = { inset: 1.6, side: 20.8, radius: 2.6, stroke: 1.8 } as const

/** The character cell: left inset, width, height, and the two row origins. */
const SEAL_CELL = { x: 6.2, width: 11.6, height: 9.2, rows: [2.6, 12.2] } as const

/**
 * Placement transform for one glyph cell.
 * @param row - top edge of the cell in viewBox units.
 * @returns the transform placing the unit-box outline into that cell.
 */
function cellTransform(row: number | undefined): string {
  return `translate(${SEAL_CELL.x} ${row}) scale(${SEAL_CELL.width} ${SEAL_CELL.height})`
}

/**
 * Render the QiLin seal at the requested edge length.
 * @param props.size - rendered edge length in px.
 * @param props.className - extra class from the occupying surface.
 * @returns the seal svg (aria-hidden decorative brand art).
 */
export function QilinSealArtist({ size = 24, className }: { size?: number; className?: string | undefined }) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x={SEAL_FRAME.inset}
        y={SEAL_FRAME.inset}
        width={SEAL_FRAME.side}
        height={SEAL_FRAME.side}
        rx={SEAL_FRAME.radius}
        stroke="currentColor"
        strokeWidth={SEAL_FRAME.stroke}
      />
      <path d={SEAL_GLYPH_QI} fill="currentColor" transform={cellTransform(SEAL_CELL.rows[0])} />
      <path d={SEAL_GLYPH_LIN} fill="currentColor" transform={cellTransform(SEAL_CELL.rows[1])} />
    </svg>
  )
}

/**
 * Occupy the sidebar brand-mark slot.
 * @param props - host-supplied mark presentation.
 * @returns the seal at the sidebar's requested size.
 */
export function QilinSealMark({ size }: SidebarBrandMarkOwnerProps) {
  return <QilinSealArtist size={size ?? 24} />
}

/**
 * Occupy the conversation hero's brand-mark slot.
 * @param props - host-supplied mark presentation.
 * @returns the seal at the hero's requested size and placement class.
 */
export function QilinSealHeroMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <QilinSealArtist size={size ?? 34} className={className} />
}
