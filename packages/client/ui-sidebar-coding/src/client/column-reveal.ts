/**
 * Bringing the right column on screen, for the content this package's panel
 * puts in it.
 *
 * The single-shell port (dual workbench D5) renders the coding content body
 * INSIDE ui-sidebar-right's column: the frame owns the column's width,
 * collapse, and expand gesture, and it slides the whole body off-edge while
 * the column is collapsed. The ported panel's own open flag therefore only
 * reaches as far as the body's inner panes — a landing the user must see has
 * to ask the frame to expand, the same step the frame's own page opens take
 * ("content the user cannot see is not opened").
 *
 * The command is dependency-free (no React / ui-primitives), like the sibling
 * interception modules, so the decision is unit-testable and the file stays
 * importable from the test runtime.
 */
import type { Context } from '../context-types.ts'

/** The column's collapse commands (the frame's `sidebarRight` face, read structurally). */
export interface ColumnRevealFace {
  /** Whether the column currently shows its panel. */
  isExpanded?: () => boolean
  /** Collapse the column, or expand it and focus its active dock pane. */
  toggleExpanded?: () => void
}

/**
 * Build the command that shows the column this package's content body is
 * rendered in. Nothing happens while the body's own tag is inactive (the
 * column then holds the native pages, which reveal themselves), while the
 * column already shows its panel, or on a composition without the frame's
 * write command.
 *
 * The frame's face is read through `ctx.get` like every other optional service
 * here: a direct `ctx.sidebarRight` property read throws under cordis's inject
 * enforcement ("cannot get property ... without inject").
 *
 * @param ctx - client context carrying the frame's service.
 * @param isCodingActive - whether the coding tag currently occupies the column.
 * @returns the reveal command (a no-op in every case above).
 */
export function createColumnReveal(ctx: Context, isCodingActive: () => boolean): () => void {
  return () => {
    if (!isCodingActive()) return
    const right = ctx.get('sidebarRight') as ColumnRevealFace | undefined
    if (right?.isExpanded?.() !== false) return
    try {
      right.toggleExpanded?.()
    } catch (error) {
      // The controller refuses a write with no on-screen Session surface
      // (`require()`): there is no rendered body to reveal, and the tab stays
      // in the panel's own state for the next open.
      console.debug('[ui-sidebar-coding] right column reveal skipped:', error)
    }
  }
}
