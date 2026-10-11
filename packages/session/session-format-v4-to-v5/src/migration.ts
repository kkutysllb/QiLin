/** Identity body conversion folding retired shipped preset ids onto the single PTC roster. */

import { SessionFormatError, defineSessionFormatMigration, isSessionFormatJsonObject } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatJsonObject, SessionFormatMigrationStage, SessionFormatMigrationStageInput } from '@qilin-agent/session-format'
import { assertReleasedV4Header } from '@qilin-agent/session-format-v3-to-v4'
import { assertReleasedV5Header } from './validation.ts'

/**
 * Shipped preset ids a released V4 writer could persist that the single-preset roster no longer ships.
 * `code` is absent by construction: the released V2-to-V3 edge renames it before V3.
 */
export const RETIRED_SHIPPED_PRESET_IDS: ReadonlySet<string> = new Set(['standard', 'cordis', 'minimal'])

/**
 * Fold one stored preset id onto the shipped roster survivor.
 * Custom preset ids outside the shipped vocabulary pass through unchanged.
 * @param value - stored agentPreset value.
 * @returns the roster id `ptc` for retired shipped ids, otherwise the input unchanged.
 */
export function foldRetiredPresetId(value: string): string {
  return RETIRED_SHIPPED_PRESET_IDS.has(value) ? 'ptc' : value
}

/** Rewrite retired shipped ids in one selection event; every other event passes through unchanged. */
function renameRetiredSelectionEvent(event: SessionFormatEvent): SessionFormatEvent {
  if (event.type !== 'agent-preset/selected') return event
  const data = event.data as SessionFormatJsonObject
  if (typeof data['agentPreset'] !== 'string') return event
  const agentPreset = foldRetiredPresetId(data['agentPreset'])
  return agentPreset === data['agentPreset'] ? event : { ...event, data: { ...data, agentPreset } }
}

/** Header-and-selection rewrite; every other V4 byte survives into V5 unchanged. */
export const sessionFormatV4ToV5 = defineSessionFormatMigration({
  name: '@qilin-agent/session-format-v4-to-v5',
  fromVersion: 4,
  toVersion: 5,
  migrateHeader(header) {
    assertReleasedV4Header(header)
    const agentPreset = typeof header.agentPreset === 'string' ? foldRetiredPresetId(header.agentPreset) : undefined
    return { ...header, version: 5, ...(agentPreset === undefined ? {} : { agentPreset }) }
  },
  createStage(input) { return new ReleasedV4ToV5Stage(input) },
  validateTargetHeader: assertReleasedV5Header,
})

class ReleasedV4ToV5Stage implements SessionFormatMigrationStage {
  readonly headerInheritedEventCount?: number
  private lastInheritedMarker: number | undefined

  constructor(private readonly input: SessionFormatMigrationStageInput) {
    assertReleasedV4Header(input.sourceHeader)
    // An unseeded source has a zero cut before EOF; a seeded cut waits for its end-seed marker.
    if (!input.sourceHeader.isSeeded) this.headerInheritedEventCount = 0
  }

  transformEvent(event: SessionFormatEvent, context: { emitEvent(event: SessionFormatEvent): void }): void {
    if (event.type === 'session/end-seed' && isSessionFormatJsonObject(event.data) && event.data['inherited'] === true) {
      this.lastInheritedMarker = event.seq
    }
    context.emitEvent(renameRetiredSelectionEvent(event))
  }

  transformRun(run: Parameters<SessionFormatMigrationStage['transformRun']>[0], context: { emitRun(run: Parameters<SessionFormatMigrationStage['transformRun']>[0]): void }): void {
    // Compact runs hold assistant attempts only; selection events are plain events and never reach a run.
    context.emitRun(run)
  }

  finish(): number {
    if (!this.input.sourceHeader.isSeeded) return 0
    if (this.lastInheritedMarker === undefined) {
      throw new SessionFormatError('format v4 seeded Session has no inherited end-seed marker')
    }
    // The marker's own index is the cut: it closes the inherited prefix from the first current position.
    return this.lastInheritedMarker
  }
}
