/**
 * The shipped presets enable model-facing child selection but do not pin a
 * route: the subagent seam owns the default (deployment `childRouteDefaults`
 * and the Plugins → Subagent default selection), so a preset copied into
 * another deployment does not carry one provider's model into it.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@qilin-agent/kylin-plugin-include'
import { describe, expect, it } from 'vitest'
import { SHIPPED_PRESET_ROOT } from '@qilin-agent/agent-presets'

/** One row of a preset composition, including the group's nested row list. */
interface PresetRow {
  readonly id?: string
  readonly name?: string
  readonly config?: unknown
  readonly [key: string]: unknown
}

/** Read one shipped preset's composition as parsed YAML rows. */
function compositionOf(presetId: string): PresetRow[] {
  const source = readFileSync(join(SHIPPED_PRESET_ROOT, presetId, 'agent.cordis.yml'), 'utf8')
  // Same schema discovery uses: the compositions carry `!!js` expressions.
  return yaml.load(source, { schema: entryListSchema }) as PresetRow[]
}

/** Find one row by id anywhere in the composition, including nested groups. */
function rowById(rows: readonly PresetRow[], id: string): PresetRow | undefined {
  for (const row of rows) {
    if (row.id === id) return row
    const nested = row.config
    if (Array.isArray(nested)) {
      const found = rowById(nested as PresetRow[], id)
      if (found !== undefined) return found
    }
  }
  return undefined
}

describe('shipped preset delegation rows', () => {
  it.each(['standard', 'ptc'])('enables selection without pinning a route in %s', (presetId) => {
    const row = rowById(compositionOf(presetId), 'tool-subagent')
    expect(row?.name).toBe('@qilin-agent/tool-subagent')
    expect(row?.config).toMatchObject({ toolName: 'subagent', modelSelectionSettings: true })
    expect(row?.config).not.toHaveProperty('agentOptions')
  })

  it.each(['standard', 'ptc'])('keeps the %s fork delegation on the parent route', (presetId) => {
    const row = rowById(compositionOf(presetId), 'tool-subagent-fork')
    expect(row?.config).toMatchObject({ toolName: 'subagent_fork' })
    expect(row?.config).not.toHaveProperty('agentOptions')
  })
})
