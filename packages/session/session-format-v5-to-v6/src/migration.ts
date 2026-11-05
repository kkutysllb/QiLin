/** V5-to-V6 adjacency: only the header version moves; every recorded field and row survives. */

import { SessionFormatError, defineSessionFormatMigration, isSessionFormatJsonObject } from '@qilin-agent/session-format'
import type { SessionFormatEvent, SessionFormatEventRun, SessionFormatMigrationStage, SessionFormatMigrationStageInput } from '@qilin-agent/session-format'
import { assertReleasedV5Header } from '@qilin-agent/session-format-v4-to-v5'
import { assertReleasedV6Header } from './validation.ts'

/** Header version transition; every other V5 byte survives into V6 unchanged. */
export const sessionFormatV5ToV6 = defineSessionFormatMigration({
  name: '@qilin-agent/session-format-v5-to-v6',
  fromVersion: 5,
  toVersion: 6,
  migrateHeader(header) {
    assertReleasedV5Header(header)
    return { ...header, version: 6 }
  },
  createStage(input) { return new ReleasedV5ToV6Stage(input) },
  validateTargetHeader: assertReleasedV6Header,
})

class ReleasedV5ToV6Stage implements SessionFormatMigrationStage {
  readonly headerInheritedEventCount?: number
  private lastInheritedMarker: number | undefined

  constructor(private readonly input: SessionFormatMigrationStageInput) {
    assertReleasedV5Header(input.sourceHeader)
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
      throw new SessionFormatError('format v5 seeded Session has no inherited end-seed marker')
    }
    // The marker's own index is the cut: it closes the inherited prefix from the first current position.
    return this.lastInheritedMarker
  }
}
