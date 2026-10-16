/** The market bundle must carry one parseable, explicit market layer. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@qilin-agent/kylin-plugin-include'

describe('plugin market bundle', () => {
  it('declares a public parseable layer with the Host service and the Discover tab', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      private?: boolean
      publishConfig?: { access?: string }
      dependencies?: Record<string, string>
      qilin?: { bundle?: { patch?: string } }
    }
    expect(manifest.private).toBeUndefined()
    expect(manifest.publishConfig?.access).toBe('public')
    expect(manifest.qilin?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies).toMatchObject({
      '@qilin-agent/client-ui-plugin-market': 'workspace:*',
      '@qilin-agent/plugin-market': 'workspace:*',
    })

    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.qilin!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    )
    expect(Array.isArray(parsed)).toBe(true)
    const patches = parsed as { insert?: { id?: string; name?: string; disabled?: unknown }[] }[]
    const inserted = patches.flatMap(patch => patch.insert ?? [])
    // The opt-in layer ships both halves: the Host index reader and the Web tab.
    expect(inserted.find(entry => entry.id === 'plugin-market')).toMatchObject({
      name: '@qilin-agent/plugin-market',
    })
    expect(inserted.find(entry => entry.id === 'ui-plugin-market')).toMatchObject({
      name: '@qilin-agent/client-ui-plugin-market',
    })
  })
})
