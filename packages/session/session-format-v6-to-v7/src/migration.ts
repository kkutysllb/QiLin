/** V6-to-V7 adjacency: only the header version moves; every recorded V6 row survives. */

import { SessionFormatError, defineSessionFormatMigration, isSessionFormatJsonObject } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatEventRun, SessionFormatMigrationStage, SessionFormatMigrationStageInput } from '@qilin-agent/session-format'
import { assertReleasedV6Header } from '@qilin-agent/session-format-v5-to-v6'
import { assertReleasedV7Header } from './validation.ts'

/**
 * Header version transition; every other V6 byte survives into V7 unchanged.
 * A V6 writer had no `team/mode` vocabulary, so V6 sources carry no Team-mode
 * fact to convert; the target generation validates one when it arrives.
 */
export const sessionFormatV6ToV7 = defineSessionFormatMigration({
  name: '@qilin-agent/session-format-v6-to-v7',
  fromVersion: 6,
  toVersion: 7,
  migrateHeader(header) {
    assertReleasedV6Header(header)
    return { ...header, version: 7 }
  },
  createStage(input) { return new ReleasedV6ToV7Stage(input) },
  validateTargetHeader: assertReleasedV7Header,
})

class ReleasedV6ToV7Stage implements SessionFormatMigrationStage {
  readonly headerInheritedEventCount?: number
  private lastInheritedMarker: number | undefined

  constructor(private readonly input: SessionFormatMigrationStageInput) {
    assertReleasedV6Header(input.sourceHeader)
    // An unseeded source has a zero cut before EOF; a seeded cut waits for its end-seed marker.
    if (!input.sourceHeader.isSeeded) this.headerInheritedEventCount = 0
  }

  transformEvent(event: SessionFormatEvent, context: { emitEvent(event: SessionFormatEvent): void }): void {
    if (event.type === 'session/end-seed' && isSessionFormatJsonObject(event.data) && event.data['inherited'] === true) {
      this.lastInheritedMarker = event.seq
    }
    context.emitEvent(event)
  }

  transformRun(run: SessionFormatEventRun, context: { emitRun(run: SessionFormatEventRun): void }): void {
    context.emitRun(run)
  }

  finish(): number {
    if (!this.input.sourceHeader.isSeeded) return 0
    if (this.lastInheritedMarker === undefined) {
      throw new SessionFormatError('format v6 seeded Session has no inherited end-seed marker')
    }
    // The marker's own index is the cut: it closes the inherited prefix from the first current position.
    return this.lastInheritedMarker
  }
}
