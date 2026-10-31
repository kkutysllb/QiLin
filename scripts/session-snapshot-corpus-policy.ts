/** Retained V3 replay inputs, current-writer fixtures, and bounded older migration coverage. */

import { SESSION_FORMAT_VERSION } from '@qilin-agent/session'
import type { SnapshotSessionFormatManifest } from '@qilin-agent/session-snapshot'

/** One owning scenario's selected parent and child generations. */
export interface SnapshotCorpusScenarioGenerations {
  /** Corpus-relative profile/scenario key. */
  readonly key: string
  /** Highest selected generation for each contiguous role. */
  readonly selectedVersions: readonly number[]
  /** Explicit historical generation and the behavior it preserves. */
  readonly retained?: SnapshotSessionFormatManifest
}

/** Counts returned after the corpus policy accepts the inventory. */
export interface SnapshotCorpusGenerationSummary {
  readonly currentRoles: number
  readonly baselineRoles: number
  readonly retainedRoles: number
  readonly retainedScenarios: number
}

const RETAINED_BASELINE_VERSION = 3
/**
 * Scenarios whose selected role still sits on the v4 payload generation, with the condition that
 * blocks its v5 fixture. Every entry is a TODO: once its named fix lands, refresh writes the v5
 * fixture and the entry disappears; the policy then accepts only the baseline and current
 * generations again.
 */
const PENDING_V4_SCENARIOS: ReadonlyMap<string, string> = new Map([
  ['session/compaction-output-reserve', 'keyless replay cannot emit a compaction event; needs a live re-record with an API key'],
  ['session/compaction-summary-headroom', 'keyless replay cannot emit a compaction event; needs a live re-record with an API key'],
  ['session/subagent-depth-two-rejection', 'the committed child fixture is truncated at its first request, so llm-replay returns no response for the depth-2 role'],
  ['session/windows-acl-skill', 'windows-only workspace setup; no legal v5 on macOS'],
  ['sdk/serial-created', 'keyless refresh writes a header-only v5 while the committed v3 holds the full turn; needs a live re-record'],
  ['sdk/subagent-activation-limit', 'refresh hangs to the 120s timeout after the in-process child ends without subagent.finished'],
  ['sdk/subagent-qilin-sdk-dynamic-route', 'the separate qilin SDK child never persists its second session; provider/harness fix needed'],
  ['sdk/subagent-spawn-in-process', 'the in-process child fixture carries no script entries, so llm-replay exhausts and subagent.finished never fires'],
  ['sdk/tool-error-details', 'mixed tool presentation was removed upstream (8231e0614c); the fixture needs rework to one mode'],
])
const MAX_RETAINED_ROLES = 11
const REQUIRED_V0_COVERAGE = new Set([
  'multi-hop',
  'packed-row',
  'retry-failure',
  'shipped-profile',
])
const REQUIRED_ADJACENT_COVERAGE = new Set(['adjacent-migration'])

/**
 * Require a baseline/current majority and direct coverage of each historical migration source.
 *
 * @param scenarios - Every owning top-level recorded-session scenario.
 * @returns Accepted current, baseline, and explicitly retained role counts.
 */
export function assertSnapshotCorpusPolicy(
  scenarios: readonly SnapshotCorpusScenarioGenerations[],
): SnapshotCorpusGenerationSummary {
  let currentRoles = 0
  let baselineRoles = 0
  let retainedRoles = 0
  let retainedScenarios = 0
  const coverageByVersion = new Map<number, Set<string>>()

  for (const scenario of scenarios) {
    const selectedVersion = scenario.selectedVersions[0]
    if (selectedVersion === undefined) {
      throw new Error(`${scenario.key}: scenario owns no selected Session role`)
    }
    if (scenario.retained === undefined) {
      const pending = PENDING_V4_SCENARIOS.get(scenario.key)
      if (pending === undefined) {
        const outside = scenario.selectedVersions.find(version => version !== RETAINED_BASELINE_VERSION
          && version !== SESSION_FORMAT_VERSION)
        if (outside !== undefined) {
          throw new Error(
            `${scenario.key}: selected Session generation v${outside} must be retained baseline v${RETAINED_BASELINE_VERSION} or current v${SESSION_FORMAT_VERSION}; v4 is only accepted for a listed pending scenario`,
          )
        }
        const mixed = scenario.selectedVersions.find(version => version !== selectedVersion)
        if (mixed !== undefined) {
          throw new Error(
            `${scenario.key}: selected Session generations v${selectedVersion} and v${mixed} differ; only a listed pending scenario may mix generations`,
          )
        }
      } else {
        // Mixed generations are legal only while the named fix is pending (session/ralph-loop keeps
        // its v4 parent beside v3 children; session/subagent-depth-two-rejection keeps a v4 child).
        const outside = scenario.selectedVersions.find(version => version !== RETAINED_BASELINE_VERSION
          && version !== 4 && version !== SESSION_FORMAT_VERSION)
        if (outside !== undefined) {
          throw new Error(
            `${scenario.key}: pending v4 scenario selected Session generation v${outside}; expected v3, v4, or v${SESSION_FORMAT_VERSION}`,
          )
        }
      }
      if (selectedVersion === SESSION_FORMAT_VERSION) {
        currentRoles += scenario.selectedVersions.length
      } else {
        baselineRoles += scenario.selectedVersions.length
      }
      continue
    }
    const expectedVersion = scenario.retained.version
    const mismatched = scenario.selectedVersions.find(version => version !== expectedVersion)
    if (mismatched !== undefined) {
      throw new Error(
        `${scenario.key}: selected Session generation v${mismatched} does not match expected v${expectedVersion}`,
      )
    }
    const retiredTools = scenario.retained.coverage.length === 1 && scenario.retained.coverage[0] === 'retired-tools'
    if (!Number.isSafeInteger(scenario.retained.version)
      || scenario.retained.version < 0 || scenario.retained.version > SESSION_FORMAT_VERSION
      || (scenario.retained.version === SESSION_FORMAT_VERSION && !retiredTools)) {
      throw new Error(`${scenario.key}: retained Session format must precede current v${SESSION_FORMAT_VERSION} unless it pins retired tools at that version`)
    }
    const allowedCoverage = retiredTools ? new Set(['retired-tools']) : scenario.retained.version === 0
      ? REQUIRED_V0_COVERAGE
      : REQUIRED_ADJACENT_COVERAGE
    if (scenario.retained.coverage.some(item => !allowedCoverage.has(item))) {
      throw new Error(
        `${scenario.key}: v${scenario.retained.version} retained coverage must be ${[...allowedCoverage].join(', ')}`,
      )
    }
    retainedRoles += scenario.selectedVersions.length
    retainedScenarios += 1
    const coverage = coverageByVersion.get(scenario.retained.version) ?? new Set<string>()
    coverageByVersion.set(scenario.retained.version, coverage)
    for (const item of scenario.retained.coverage) coverage.add(item)
  }

  if (baselineRoles > 0) coverageByVersion.set(RETAINED_BASELINE_VERSION, new Set(REQUIRED_ADJACENT_COVERAGE))
  for (let version = 0; version < SESSION_FORMAT_VERSION; version += 1) {
    const required = version === 0 ? REQUIRED_V0_COVERAGE : REQUIRED_ADJACENT_COVERAGE
    const coverage = coverageByVersion.get(version)
    const missing = [...required].filter(item => !coverage?.has(item))
    if (missing.length > 0) {
      throw new Error(`Session corpus lacks v${version} coverage: ${missing.join(', ')}`)
    }
  }
  if (retainedRoles > MAX_RETAINED_ROLES) {
    throw new Error(`Session corpus retains ${retainedRoles} historical roles; maximum is ${MAX_RETAINED_ROLES}`)
  }
  if (baselineRoles + currentRoles <= retainedRoles) {
    throw new Error(
      `Session corpus requires a baseline/current majority; baseline=${baselineRoles}, current=${currentRoles}, retained=${retainedRoles}`,
    )
  }
  return { currentRoles, baselineRoles, retainedRoles, retainedScenarios }
}
