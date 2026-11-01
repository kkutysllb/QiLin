/**
 * The shipped presets pin the default route of a delegation child.
 *
 * Model-facing selection (the Plugins → Subagent allowlist) only authorizes
 * routes; a call that omits `provider`/`model` falls back to the tool
 * instance's configured child options. Both shipped presets therefore carry an
 * explicit default so delegation never silently lands on the parent's route —
 * the behavior this suite keeps from regressing when a preset row is edited.
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

/** The delegation tool's child-default route this repository ships. */
const SHIPPED_CHILD_ROUTE = { provider: 'zai-coding-cn', model: 'glm-5.3' }

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

describe('shipped preset child routes', () => {
  it.each(['standard', 'ptc'])('pins the %s delegation default route', (presetId) => {
    const row = rowById(compositionOf(presetId), 'tool-subagent')
    expect(row?.name).toBe('@qilin-agent/tool-subagent')
    expect(row?.config).toMatchObject({
      toolName: 'subagent',
      modelSelectionSettings: true,
      agentOptions: SHIPPED_CHILD_ROUTE,
    })
  })

  it.each(['standard', 'ptc'])('keeps the %s fork delegation on the parent route', (presetId) => {
    const row = rowById(compositionOf(presetId), 'tool-subagent-fork')
    expect(row?.config).toMatchObject({ toolName: 'subagent_fork' })
    expect(row?.config).not.toHaveProperty('agentOptions')
  })
})
