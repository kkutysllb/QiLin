import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))
const PUBLIC_ROOT = fileURLToPath(new URL('../public', import.meta.url))

/** Install metadata the built application ships to installable browsers. */
const SHIPPED_MANIFEST = {
  id: '/workspace',
  name: 'QiLin',
  short_name: 'QILIN',
  start_url: '/workspace',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

/**
 * Read a PNG's pixel dimensions from its IHDR chunk.
 * @param png - Complete PNG file contents.
 * @returns The width and height declared by the image header.
 */
function pngDimensions(png: Buffer): { width: number; height: number } {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!png.subarray(0, 8).equals(signature)) throw new Error('not a PNG file: missing PNG signature')
  if (png.subarray(12, 16).toString('latin1') !== 'IHDR') throw new Error('not a PNG file: first chunk is not IHDR')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  // The shell mounts under any base (`base: './'` in the Vite config), so the
  // build rewrites the authored absolute href into this relative one.
  expect(index).toContain('<link rel="manifest" href="./manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual(SHIPPED_MANIFEST)
})

it('ships every declared icon at the size the manifest promises', async () => {
  for (const icon of SHIPPED_MANIFEST.icons) {
    const { width, height } = pngDimensions(await readFile(join(PUBLIC_ROOT, icon.src.replace(/^\//, ''))))
    expect(`${String(width)}x${String(height)}`).toBe(icon.sizes)
  }

  // Nothing in the manifest names the iOS home-screen icon, so only this check
  // would catch it drifting off the 180px square iOS expects.
  const appleTouch = pngDimensions(await readFile(join(PUBLIC_ROOT, 'apple-touch-icon.png')))
  expect(`${String(appleTouch.width)}x${String(appleTouch.height)}`).toBe('180x180')
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
