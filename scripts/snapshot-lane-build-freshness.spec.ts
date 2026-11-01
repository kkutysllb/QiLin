import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_BUILD_RECORD_PATH } from './client-build-environment.ts'
import {
  assertSnapshotLaneBuildFresh,
  inspectSnapshotLaneBuildFreshness,
  SNAPSHOT_ALLOW_STALE_BUILD_ENV,
} from './snapshot-lane-build-freshness.ts'

const roots: string[] = []
const PAST = 1_700_000_000
const RECORD_TIME = PAST + 100
const LATER = PAST + 200

/** Create an isolated repository root carrying one build record. */
function repository(options: { record?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'qilin-snapshot-build-'))
  roots.push(root)
  if (options.record !== false) {
    const record = resolve(root, CLIENT_BUILD_RECORD_PATH)
    mkdirSync(resolve(record, '..'), { recursive: true })
    writeFileSync(record, '{}\n')
    utimesSync(record, RECORD_TIME, RECORD_TIME)
  }
  return root
}

/** Write one source file with an exact modification time. */
function source(root: string, path: string, seconds: number): void {
  const absolute = resolve(root, path)
  mkdirSync(resolve(absolute, '..'), { recursive: true })
  writeFileSync(absolute, 'export const value = 1\n')
  utimesSync(absolute, seconds, seconds)
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('snapshot lane build freshness', () => {
  it('rejects a tree with no complete build record', () => {
    const root = repository({ record: false })
    expect(() => inspectSnapshotLaneBuildFreshness(root)).toThrow(/no build record/)
  })

  it('accepts a build record newer than every source', () => {
    const root = repository()
    source(root, 'packages/core/session/src/index.ts', PAST)
    source(root, 'apps/web/src/main.tsx', PAST + 1)
    const freshness = inspectSnapshotLaneBuildFreshness(root)
    expect(freshness.stale).toBe(false)
    expect(freshness.newestSource?.path).toBe('apps/web/src/main.tsx')
  })

  it('reports a source edited after the build and names it', () => {
    const root = repository()
    source(root, 'packages/subagent/subagent/src/index.ts', LATER)
    const freshness = inspectSnapshotLaneBuildFreshness(root)
    expect(freshness.stale).toBe(true)
    expect(() => assertSnapshotLaneBuildFresh(root))
      .toThrow(/packages\/subagent\/subagent\/src\/index\.ts is newer than/)
  })

  it('ignores directories no build consumes', () => {
    const root = repository()
    source(root, 'packages/subagent/subagent/tests/index.spec.ts', LATER)
    source(root, 'packages/subagent/subagent/lib/index.js', LATER)
    source(root, 'packages/subagent/subagent/node_modules/x/src/index.ts', LATER)
    expect(inspectSnapshotLaneBuildFreshness(root).stale).toBe(false)
  })

  it('accepts a stale build only through the explicit override', () => {
    const root = repository()
    source(root, 'packages/client/ui-chat/src/client/index.ts', LATER)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const gate = assertSnapshotLaneBuildFresh(root, { allowStale: true })
    expect(gate.staleAccepted).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('reports a current build without warning', () => {
    const root = repository()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const gate = assertSnapshotLaneBuildFresh(root)
    expect(gate.staleAccepted).toBe(false)
    expect(gate.freshness.stale).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('names the override in its environment variable', () => {
    expect(SNAPSHOT_ALLOW_STALE_BUILD_ENV).toBe('QILIN_SNAPSHOT_ALLOW_STALE_BUILD')
  })
})
