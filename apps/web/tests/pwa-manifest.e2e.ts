import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="./manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/workspace',
    name: 'QiLin',
    short_name: 'QILIN',
    start_url: '/workspace',
    scope: '/',
    display: 'fullscreen',
    icons: [{
      src: '/favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    }],
  })
})

it('ships the cinnabar seal as the tab icon', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'favicon.svg'), 'utf8')
  // The brand stamp: cinnabar body gradient, gold hairline ring, warm-white
  // glyph outlines, and no font dependency in the icon itself.
  expect(favicon).toContain('<linearGradient id="bgGrad"')
  expect(favicon).toContain('stop-color="#c3402f"')
  expect(favicon).toContain('stroke="#f3dc9e"')
  expect(favicon).toContain('fill="#fff5eb"')
  expect(favicon).not.toContain('<text')
})
