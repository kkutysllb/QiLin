/**
 * The bundle's substance is its patch file: the `dsh.bundle.patch` manifest
 * field must name a real, parseable patch list that restates the QiLin
 * model-facing identity instead of inheriting the dsh wording.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

interface PatchRow {
  id?: string
  config?: Record<string, unknown>
}

describe('dsh-qilin-web bundle', () => {
  it('declares a parseable patch list that names QiLin as the product', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      qilin?: { bundle?: { patch?: string } }
    }
    expect(manifest.qilin?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.qilin!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as PatchRow[]
    expect(Array.isArray(parsed)).toBe(true)
    const rows = parsed.flatMap(patch => (patch as { insert?: PatchRow[] }).insert ?? [])
    const overrides: PatchRow[] = parsed.filter(row => typeof row.id === 'string')
    const systemPrompt = [...overrides, ...rows].find(row => row.id === 'system-prompt')
    expect(systemPrompt?.config?.['personaPrefix']).toContain('QiLin')
    expect(systemPrompt?.config?.['personaSuffix']).toBe('Your working directory is {{cwd}}.')
    const webRuntime = overrides.find(row => row.id === 'web-runtime')
    expect(webRuntime?.config?.['label']).toBe('qilin')
  })
})
