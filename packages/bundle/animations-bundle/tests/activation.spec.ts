/** The built-in Animation Studio bundle mounts the shipped skill pack and nothing else. */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface AnimationsPlugin {
  readonly name: string
  readonly inject: readonly string[]
  apply(ctx: unknown, config?: unknown): () => void
}

const require = createRequire(import.meta.url)
const animations = require('dsh-animations') as AnimationsPlugin
const manifest = JSON.parse(readFileSync(require.resolve('dsh-animations/package.json'), 'utf8')) as {
  name: string
  qilin?: { bundle?: { patch?: string } }
  dsh?: { bundle?: { patch?: string } }
}

describe('animations-bundle', () => {
  beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })

  it('loads the packaged skill manifest and registers all eight skills plus the routing notice', () => {
    const skills: string[] = []
    const notices: string[] = []
    const ctx = {
      skills: { register: (entry: { name: string }) => { skills.push(entry.name); return () => {} } },
      systemPrompt: { section: (entry: { name: string }) => { notices.push(entry.name); return () => {} } },
    }
    const dispose = animations.apply(ctx)
    expect(animations.name).toBe('dsh-animations')
    expect(animations.inject).toEqual(['skills', 'systemPrompt'])
    expect(skills).toEqual([
      'ppt-animation', 'flowchart', 'network-protocol-viz', 'dynamic-archify',
      'scholar-notes', 'card-theater', 'video-shot-demos', 'phone-ui-demos',
    ])
    expect(notices).toEqual(['plugin:dsh-animations'])
    dispose()
  })

  it('keeps the capability notice optional and skips activation when disabled', () => {
    const skills: string[] = []
    const ctx = {
      skills: { register: (entry: { name: string }) => { skills.push(entry.name); return () => {} } },
      systemPrompt: { section: () => () => {} },
    }
    animations.apply(ctx, { announceToAgent: false })
    expect(skills).toHaveLength(8)
    const disabled: string[] = []
    animations.apply({
      skills: { register: (entry: { name: string }) => { disabled.push(entry.name); return () => {} } },
      systemPrompt: { section: () => () => {} },
    }, { enabled: false })
    expect(disabled).toEqual([])
  })

  it('declares a bundle patch in both manifest channels', () => {
    expect(manifest.name).toBe('dsh-animations')
    expect(manifest.qilin?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
  })
})
