/**
 * The QiLin seal: a cinnabar rounded square with a gold hairline ring and the
 * 麒 and 麟 glyph outlines side by side in warm white. The mark carries its own
 * colours because it is the product's brand stamp rather than a themed icon —
 * a cinnabar seal reads the same on a light and a dark surface. The glyphs are
 * embedded outlines, so the mark needs no font on the rendering machine.
 */

import { useId } from 'react'
import type { HeroBrandMarkOwnerProps } from '@qilin/client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@qilin/client-ui-sidebar/client'
import { SEAL_GLYPH_LIN, SEAL_GLYPH_QI } from './glyphs.ts'
import { SEAL_BODY, SEAL_CELL, SEAL_RING, cellTransform } from './seal-geometry.ts'

/** Cinnabar body gradient, top to bottom: the seal's warm lit upper edge. */
const BODY_STOPS = ['#d4503d', '#c3402f', '#a23526'] as const
/** Warm white of the glyphs against the cinnabar body. */
const GLYPH_FILL = '#fff5eb'
/** Muted gold of the hairline ring. */
const RING_STROKE = '#f3dc9e'

/**
 * Render the QiLin seal at the requested edge length.
 * @param props.size - rendered edge length in px.
 * @param props.className - extra class from the occupying surface.
 * @returns the seal svg (aria-hidden decorative brand art).
 */
export function QilinSealArtist({ size = 24, className }: { size?: number; className?: string | undefined }) {
  // One gradient id per instance: the sidebar and the hero render the seal at
  // the same time, and a shared id would make both paint the first definition.
  const gradientId = `qilin-seal-body-${useId().replace(/[^A-Za-z0-9_-]/gu, '')}`
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BODY_STOPS[0]} />
          <stop offset="55%" stopColor={BODY_STOPS[1]} />
          <stop offset="100%" stopColor={BODY_STOPS[2]} />
        </linearGradient>
      </defs>
      <rect
        x={SEAL_BODY.inset}
        y={SEAL_BODY.inset}
        width={SEAL_BODY.side}
        height={SEAL_BODY.side}
        rx={SEAL_BODY.radius}
        fill={`url(#${gradientId})`}
      />
      <ellipse cx="12" cy="-2" rx="14" ry="7" fill={GLYPH_FILL} opacity="0.08" />
      <rect
        x={SEAL_RING.inset}
        y={SEAL_RING.inset}
        width={SEAL_RING.side}
        height={SEAL_RING.side}
        rx={SEAL_RING.radius}
        stroke={RING_STROKE}
        strokeOpacity="0.5"
        strokeWidth={SEAL_RING.stroke}
      />
      <path d={SEAL_GLYPH_QI} fill={GLYPH_FILL} transform={cellTransform(SEAL_CELL.lefts[0])} />
      <path d={SEAL_GLYPH_LIN} fill={GLYPH_FILL} transform={cellTransform(SEAL_CELL.lefts[1])} />
    </svg>
  )
}

/**
 * Occupy the sidebar brand-mark slot.
 * @param props - host-supplied mark presentation.
 * @returns the seal at the sidebar's requested size.
 */
export function QilinSealMark({ size }: SidebarBrandMarkOwnerProps) {
  return <QilinSealArtist size={size} />
}

/**
 * Occupy the conversation hero's brand-mark slot.
 * @param props - host-supplied mark presentation.
 * @returns the seal at the hero's requested size and placement class.
 */
export function QilinSealHeroMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <QilinSealArtist size={size} className={className} />
}
