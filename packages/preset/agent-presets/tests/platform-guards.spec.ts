/**
 * The shipped presets' platform-guard matrix, pinned at the entry shape: the
 * PowerShell bridge is Windows-only, the Bash bridge is everywhere-but-Windows,
 * and the schedule tools mount on every platform. Inserting the tool-schedule
 * entry between tool-pwsh's name and its disabled line once migrated the guard
 * onto the schedule row, silently unmounting the scheduler on
 * macOS/Linux while arming pwsh there — the mis-attached shape this suite
 * rejects, per preset, on the parsed guard expression itself.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@qilin-agent/kylin-plugin-include'
import { describe, expect, it } from 'vitest'
import { SHIPPED_PRESET_ROOT } from '@qilin-agent/agent-presets'

/** The exact guard expressions the mounting matrix is defined in terms of. */
const BASH_GUARD = "process.platform === 'win32'"
const PWSH_GUARD = "process.platform !== 'win32'"

/** One Cordis entry-list row; `disabled` parses to a `!!js` expression node. */
interface PresetEntry {
  id?: string
  disabled?: unknown
}

/** The `!!js` expression source of a parsed guard, or undefined for a plain value or absence. */
function guardExpressionOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const expr = (value as { __jsExpr?: unknown }).__jsExpr
  return typeof expr === 'string' ? expr : undefined
}

/**
 * Assert one preset's guard matrix. A missing tool-bash/tool-pwsh row fails:
 * every shipped preset crosses platforms through both bridges, so silence is
 * not an acceptable reading of an absent row.
 */
function assertGuardMatrix(presetId: string, entries: PresetEntry[]): void {
  const bash = entries.find(entry => entry.id === 'tool-bash')
  expect(bash, `${presetId}: tool-bash entry must exist`).toBeDefined()
  expect(guardExpressionOf(bash?.disabled), `${presetId}: tool-bash guard`)
    .toBe(BASH_GUARD)
  const pwsh = entries.find(entry => entry.id === 'tool-pwsh')
  expect(pwsh, `${presetId}: tool-pwsh entry must exist`).toBeDefined()
  expect(guardExpressionOf(pwsh?.disabled), `${presetId}: tool-pwsh guard`)
    .toBe(PWSH_GUARD)
  // A preset without the scheduler row opts out by design (the shipped three
  // all carry it); one that carries the row must not carry a guard with it —
  // that is exactly the migrated-guard shape.
  const schedule = entries.find(entry => entry.id === 'tool-schedule')
  if (schedule === undefined) return
  expect(schedule.disabled, `${presetId}: tool-schedule must mount on every platform`)
    .toBeUndefined()
}

/** Parse one shipped preset's Cordis entry list. */
async function shippedEntries(presetId: string): Promise<PresetEntry[]> {
  const source = await readFile(join(SHIPPED_PRESET_ROOT, presetId, 'agent.cordis.yml'), 'utf8')
  const entries: unknown = yaml.load(source, { schema: entryListSchema })
  expect(Array.isArray(entries), `${presetId} preset must contain a Cordis entry list`).toBe(true)
  return entries as PresetEntry[]
}

describe('the shipped presets platform guards', () => {
  it('keeps the Windows bridges guarded and the scheduler unguarded in every shipped preset', async () => {
    const presetIds = (await readdir(SHIPPED_PRESET_ROOT, { withFileTypes: true }))
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .sort()
    expect(presetIds.length).toBeGreaterThan(0)
    for (const presetId of presetIds) {
      assertGuardMatrix(presetId, await shippedEntries(presetId))
    }
  })

  it('rejects the migrated-guard shape the tool-schedule insertion once produced', () => {
    // The historical mis-attachment, reconstructed entry-for-entry: pwsh lost
    // its guard, and the schedule row below it acquired it.
    const migrated: PresetEntry[] = [
      { id: 'tool-bash', disabled: { __jsExpr: BASH_GUARD } },
      { id: 'tool-pwsh' },
      { id: 'tool-schedule', disabled: { __jsExpr: PWSH_GUARD } },
    ]
    expect(() => {
      assertGuardMatrix('rehearsal', migrated)
    }).toThrow('rehearsal: tool-pwsh guard')
  })
})
