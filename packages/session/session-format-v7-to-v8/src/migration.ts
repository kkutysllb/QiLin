/** V7-to-V8 adjacency: the coding preset label replaces the retired PTC label. */

import { SessionFormatError, defineSessionFormatMigration, isSessionFormatJsonObject } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatEventRun, SessionFormatMigrationStage, SessionFormatMigrationStageInput } from '@qilin-agent/session-format'
import { assertReleasedV7Header } from '@qilin-agent/session-format-v6-to-v7'
import { assertReleasedV8Header } from './validation.ts'

/** Preset label written before the coding-mode rename. */
const RETIRED_PRESET = 'ptc'

/** Preset label the current roster publishes. */
const CURRENT_PRESET = 'coding'

/**
 * Header transition: the version literal moves and the stored preset label
 * becomes the current one. Every other V7 field survives unchanged.
 */
export const sessionFormatV7ToV8 = defineSessionFormatMigration({
  name: '@qilin-agent/session-format-v7-to-v8',
  fromVersion: 7,
  toVersion: 8,
  migrateHeader(header) {
    assertReleasedV7Header(header)
    return {
      ...header,
      version: 8,
      ...(header['agentPreset'] === RETIRED_PRESET ? { agentPreset: CURRENT_PRESET } : {}),
    }
  },
  createStage(input) { return new ReleasedV7ToV8Stage(input) },
  validateTargetHeader: assertReleasedV8Header,
})

class ReleasedV7ToV8Stage implements SessionFormatMigrationStage {
  readonly headerInheritedEventCount?: number
  private lastInheritedMarker: number | undefined

  constructor(private readonly input: SessionFormatMigrationStageInput) {
    assertReleasedV7Header(input.sourceHeader)
    // An unseeded source has a zero cut before EOF; a seeded cut waits for its end-seed marker.
    if (!input.sourceHeader.isSeeded) this.headerInheritedEventCount = 0
  }

  transformEvent(event: SessionFormatEvent, context: { emitEvent(event: SessionFormatEvent): void }): void {
    if (event.type === 'session/end-seed' && isSessionFormatJsonObject(event.data) && event.data['inherited'] === true) {
      this.lastInheritedMarker = event.seq
    }
    if (event.type === 'agent-preset/selected' && isSessionFormatJsonObject(event.data)
      && event.data['agentPreset'] === RETIRED_PRESET) {
      context.emitEvent({ ...event, data: { ...event.data, agentPreset: CURRENT_PRESET } })
      return
    }
    context.emitEvent(event)
  }

  transformRun(run: SessionFormatEventRun, context: { emitRun(run: SessionFormatEventRun): void }): void {
    context.emitRun(run)
  }

  finish(): number {
    if (!this.input.sourceHeader.isSeeded) return 0
    if (this.lastInheritedMarker === undefined) {
      throw new SessionFormatError('format v7 seeded Session has no inherited end-seed marker')
    }
    return this.lastInheritedMarker
  }
}
