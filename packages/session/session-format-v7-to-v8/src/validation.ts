/** Native V8 metadata validation; released V7 structure with the coding preset label. */

import { SessionFormatError, SessionFormatUnsupportedMigrationError, isSessionFormatJsonObject, sessionFormatCount } from '@qilin-agent/session-format'
import type { SessionFormatArtifact, SessionFormatEvent } from '@qilin-agent/session-format'
import { assertReleasedV7Header } from '@qilin-agent/session-format-v6-to-v7'
import {
  assertV4DeveloperData,
  assertV4ForkResult,
  assertV4LifecycleRelationships,
  assertV4MessageSources,
  assertV4RetiredSyntax,
  assertV4SystemMessageFields,
  assertV4ToolResultMessage,
  catalogFact,
} from '@qilin-agent/session-format-v3-to-v4'

/** Team mode carried by a Session before and after one `team/mode` event. */
type TeamMode = 'off' | 'on'

/**
 * Validate the exact native V8 logical header.
 * The header fields are the released V7 set; the version literal moved and the
 * coding preset is spelled `coding` instead of the retired `ptc`.
 * @param header - decoded or otherwise untrusted V8 Session header candidate.
 */
export function assertReleasedV8Header(header: unknown): void {
  if (!isSessionFormatJsonObject(header) || header['version'] !== 8) throw new SessionFormatError('expected format v8 header')
  assertReleasedV7Header({ ...header, version: 7 })
}

function validateTeamMode(event: SessionFormatEvent, current: TeamMode): TeamMode {
  const data = event.data
  if (!isSessionFormatJsonObject(data)) throw new SessionFormatError('format v8 team/mode data must be an object')
  for (const key of Object.keys(data)) {
    if (key !== 'mode' && key !== 'source') throw new SessionFormatError(`format v8 team/mode has unexpected field ${JSON.stringify(key)}`)
  }
  if (data['source'] !== undefined && data['source'] !== 'composition') {
    throw new SessionFormatError('format v8 team/mode has an unsupported source')
  }
  const mode = data['mode']
  if (mode !== 'off' && mode !== 'on') throw new SessionFormatError('format v8 team/mode requires mode "off" or "on"')
  if (mode === current) throw new SessionFormatError(`format v8 team/mode repeats ${mode}`)
  return mode
}

function validateTurnRetry(event: SessionFormatEvent): void {
  const data = event.data
  if (!isSessionFormatJsonObject(data)) throw new SessionFormatError('format v8 turn/retry data must be an object')
  for (const key of Object.keys(data)) {
    if (key !== 'turn' && key !== 'retriedTurn') throw new SessionFormatError(`format v8 turn/retry has unexpected field ${JSON.stringify(key)}`)
  }
  const turn = sessionFormatCount(data['turn'], 'format v8 turn/retry turn')
  const retriedTurn = sessionFormatCount(data['retriedTurn'], 'format v8 turn/retry retriedTurn')
  if (retriedTurn >= turn) throw new SessionFormatError('format v8 turn/retry must name an earlier turn')
}

/**
 * Validate V8 inheritance, native message admission, lifecycle, compaction,
 * tool, retry, title, command, catalog, delivery, ownership, and Team-mode
 * rules. Structure and admission follow the released V7 rules.
 * @param artifact - complete detached V8 artifact.
 * @param knownEventTypes - event types understood by the installed Session package.
 * @returns the same validated artifact and event objects.
 */
export function restoreReleasedV8Artifact(artifact: SessionFormatArtifact, knownEventTypes: ReadonlySet<string>): SessionFormatArtifact {
  assertReleasedV8Header(artifact.header)
  const cut = sessionFormatCount(artifact.inheritedEventCount, 'format v8 inherited event count')
  if (cut > artifact.events.length) throw new SessionFormatError('format v8 inherited event count exceeds its events')
  if (!artifact.header.isSeeded && cut !== 0) throw new SessionFormatError('unseeded format v8 Session has inherited events')
  let lastInheritedMarker: number | undefined
  let teamMode: TeamMode = 'off'
  for (const [index, event] of artifact.events.entries()) {
    if (!knownEventTypes.has(event.type) && event['ignorable'] !== true) {
      throw new SessionFormatUnsupportedMigrationError(`format v8 contains unknown event type ${JSON.stringify(event.type)} at seq ${index}`)
    }
    if (event.seq !== index) throw new SessionFormatError(`format v8 event ${index} is not dense`)
    if (!knownEventTypes.has(event.type)) continue
    assertV4RetiredSyntax(event)
    assertV4SystemMessageFields(event)
    assertV4ToolResultMessage(event)
    assertV4ForkResult(event)
    if (event.type === 'team/mode') teamMode = validateTeamMode(event, teamMode)
    if (event.type === 'turn/retry') validateTurnRetry(event)
    if (event.type === 'session/end-seed' && isSessionFormatJsonObject(event.data)
      && event.data['inherited'] === true) lastInheritedMarker = index
  }
  if (artifact.header.isSeeded && lastInheritedMarker !== cut) {
    throw new SessionFormatError('format v8 seeded header disagrees with its last inherited end-seed marker')
  }
  if (!artifact.header.isSeeded && lastInheritedMarker !== undefined) {
    throw new SessionFormatError('format v8 unseeded Session contains an inherited end-seed marker')
  }
  assertReleasedV8Relationships(artifact, knownEventTypes)
  return artifact
}

function validateDeliveryAccepted(event: SessionFormatEvent, currentVersion: 8): string | undefined {
  if (event.type !== 'session-log-deepseek/delivery-accepted') return undefined
  const data = event.data
  if (!isSessionFormatJsonObject(data)) throw new SessionFormatError('delivery-accepted data must be an object')
  const version = sessionFormatCount(data['sessionFormatVersion'] === undefined ? 0 : data['sessionFormatVersion'], 'delivery sessionFormatVersion')
  if (version !== currentVersion) return undefined
  const throughSeq = sessionFormatCount(data['throughSeq'], 'delivery throughSeq')
  if (throughSeq >= event.seq) throw new SessionFormatError('delivery throughSeq must precede its marker')
  const id = data['sessionId']
  if (typeof id !== 'string' || id.length === 0) throw new SessionFormatError('delivery requires a nonempty Session id')
  return id
}

/**
 * Validate native developer fields, message sources, lifecycle, catalog, and
 * delivery relationships without changing event vocabulary or tail recovery.
 * @param artifact - decoded artifact with its final inherited cut.
 * @param knownEventTypes - installed event types whose payloads this reader interprets.
 */
export function assertReleasedV8Relationships(artifact: SessionFormatArtifact, knownEventTypes: ReadonlySet<string>): void {
  const ids = new Set<string>()
  for (const event of artifact.events) {
    if (!knownEventTypes.has(event.type)) continue
    assertV4DeveloperData(event)
    assertV4MessageSources(event)
    const deliveryId = validateDeliveryAccepted(event, 8)
    if (deliveryId !== undefined
      && !(artifact.header.parentSession !== undefined && event.seq < artifact.inheritedEventCount)
      && deliveryId !== artifact.header.id) {
      throw new SessionFormatError('current-generation delivery marker names the wrong Session')
    }
    if (event.type === 'subagent/catalog' && event.seq >= artifact.inheritedEventCount) {
      const fact = catalogFact(event.data)
      const id = fact['childId'] as string
      if (ids.has(id)) throw new SessionFormatError(`duplicate catalog child ${id}`)
      ids.add(id)
    }
  }
  assertV4LifecycleRelationships(artifact, knownEventTypes)
}
