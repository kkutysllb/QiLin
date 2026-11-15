/** The built-in Image Studio bundle mounts the shipped image plugin as one host and client package. */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

interface ImagesPlugin {
  readonly name: string
  readonly inject: readonly string[]
  readonly Config: unknown
  apply(ctx: unknown, config?: unknown): () => void
}

const require = createRequire(import.meta.url)
const images = require('dsh-kylin-images') as ImagesPlugin
const manifest = JSON.parse(readFileSync(require.resolve('dsh-kylin-images/package.json'), 'utf8')) as {
  name: string
  exports?: Record<string, unknown>
  qilin?: { client?: { bundle?: string; platform?: string } }
  dsh?: { client?: { bundle?: string; platform?: string } }
}

describe('kylin-images-bundle', () => {
  it('loads the shipped host plugin contract', () => {
    expect(images.name).toBe('dsh-kylin-images')
    expect(images.inject).toEqual(['tools', 'webServer'])
    expect(typeof images.apply).toBe('function')
    expect(images.Config).toBeDefined()
  })

  it('ships a self-registering browser half through the package exports', () => {
    expect(manifest.name).toBe('dsh-kylin-images')
    expect(manifest.qilin?.client?.bundle).toBe('./client.js')
    expect(manifest.qilin?.client?.platform).toBe('web')
    const client = require.resolve('dsh-kylin-images/client')
    expect(existsSync(client)).toBe(true)
    expect(readFileSync(client, 'utf8')).toContain("id: 'dsh-kylin-images'")
  })
})
