/** Seal geometry: the frame, the two glyph cells, and the transform each needs. */

/** Frame square, its corner radius, and the stroke that draws the seal body. */
export const SEAL_FRAME = { inset: 1.6, side: 20.8, radius: 2.6, stroke: 1.8 } as const

/** The character cell: left inset, width, height, and the two row origins. */
export const SEAL_CELL = { x: 6.2, width: 11.6, height: 9.2, rows: [2.6, 12.2] } as const

/**
 * Placement transform for one glyph cell.
 * @param row - top edge of the cell in viewBox units.
 * @returns the transform placing the unit-box outline into that cell.
 */
export function cellTransform(row: number | undefined): string {
  return `translate(${SEAL_CELL.x} ${row}) scale(${SEAL_CELL.width} ${SEAL_CELL.height})`
}
