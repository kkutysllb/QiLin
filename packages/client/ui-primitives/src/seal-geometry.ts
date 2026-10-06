/** Seal geometry: the cinnabar body, its gold hairline ring, and the two glyph cells. */

/** The seal body: a rounded square filling the viewBox. */
export const SEAL_BODY = { inset: 0, side: 24, radius: 5.2 } as const

/** The gold hairline ring inside the body, close to its edge. */
export const SEAL_RING = { inset: 0.94, side: 22.13, radius: 4.31, stroke: 0.375 } as const

/** The glyph cells: side by side and centered vertically in the body. */
export const SEAL_CELL = { size: 9.6, top: 7.2, lefts: [2.28, 12.12] as const }

/**
 * Placement transform for one glyph cell.
 * @param left - left edge of the cell in viewBox units.
 * @returns the transform placing the unit-box outline into that cell.
 */
export function cellTransform(left: number): string {
  return `translate(${String(left)} ${String(SEAL_CELL.top)}) scale(${String(SEAL_CELL.size)})`
}
