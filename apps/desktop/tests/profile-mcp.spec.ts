/** MCP resource ownership in the shipped Desktop composition. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { composeEntries, loadOverlayPatches, loadProfileDirectory } from '@qilin/app-boot'
import { createPluginProfile } from '../src/project-manager.ts'

it('retains one shared resource consumer after the Desktop host overlay', () => {
  const home = mkdtempSync(join(tmpdir(), 'qilin-desktop-profile-mcp-'))
  try {
    const profileDir = join(home, 'profiles', 'desktop')
    createPluginProfile(profileDir)
    const installAnchor = fileURLToPath(new URL('../../cli/package.json', import.meta.url))
    const profile = loadProfileDirectory('qilin desktop', profileDir, installAnchor)
    const overlay = fileURLToPath(new URL('../../desktop-host/config/desktop.cordis.patch.yml', import.meta.url))
    const warnings: string[] = []
    const rows = composeEntries([
      ...profile.layers.map(layer => layer.patches),
      profile.patches,
      loadOverlayPatches('qilin desktop', overlay),
    ], message => warnings.push(message))

    expect(rows.filter(row => row.name === '@qilin/mcp-resources')).toEqual([
      { id: 'mcp-resources', name: '@qilin/mcp-resources' },
    ])
    expect(rows.filter(row => row.name === '@qilin/mcp-client')).toEqual([])
    expect(rows.find(row => row.id === 'webserver')?.disabled).toBe(true)
    expect(warnings).toEqual([])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
