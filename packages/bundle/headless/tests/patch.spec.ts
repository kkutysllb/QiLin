/**
 * The headless bundle's substance is its patch file: the `qilin.bundle.patch`
 * manifest field must name a real, parseable patch list, and the one-shot
 * profile must keep the interactive credential store disabled.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@qilin-agent/kylin-plugin-include'

describe('qilin-headless bundle', () => {
  it('declares a parseable patch list through the qilin.bundle.patch manifest field', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      qilin?: { bundle?: { patch?: string } }
    }
    expect(manifest.qilin?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.qilin!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    )
    expect(Array.isArray(parsed)).toBe(true)
    const rows = parsed as { id?: string; disabled?: boolean; insert?: { id?: string }[] }[]
    // One-shot jobs never read the interactive credential store: the
    // adapters fall back to the environment and .env files.
    expect(rows.find(row => row.id === 'credentials')?.disabled).toBe(true)
    expect(rows.find(row => row.id === 'hmr')?.disabled).toBe(true)
    const inserted = rows.flatMap(row => row.insert ?? []).map(row => row.id)
    expect(inserted).toContain('headless-runner')
  })
})
