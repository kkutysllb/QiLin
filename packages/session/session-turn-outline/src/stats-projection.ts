/**
 * The `turnStats` projection unit: whole-log turn and step totals folded from
 * the loop's own boundaries. The client-facing turn outline carries each turn's
 * navigation facts but no step count, and a fleet view needs a compact figure
 * for every agent without holding its events; this unit serves that figure
 * through the session-projection seam.
 *
 * @module @qilin-agent/session-turn-outline/stats-projection
 */

import { z } from 'zod'
import type { ZodType } from 'zod'
import type { ProjectionDefinition } from '@qilin-agent/session-projection'
import type { TurnStats } from './types.ts'

const turnStatsSchema: ZodType<TurnStats> = z.object({
  turns: z.number().int().nonnegative(),
  steps: z.number().int().nonnegative(),
}).strict()

const EMPTY_STATS: TurnStats = { turns: 0, steps: 0 }

/** The `turnStats` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
export const turnStatsProjectionDefinition = {
  key: 'turnStats',
  stateVersion: 1,
  stateSchema: turnStatsSchema,
  init: () => EMPTY_STATS,
  apply: (state, event) => {
    switch (event.type) {
      case 'turn/start':
        return { turns: state.turns + 1, steps: state.steps }
      case 'step/start':
        return { turns: state.turns, steps: state.steps + 1 }
      default:
        return state
    }
  },
  wire: {
    viewSchema: turnStatsSchema,
    view: state => state,
  },
} satisfies ProjectionDefinition<'turnStats', TurnStats>
