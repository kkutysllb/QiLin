/** This suite needs the icon render toolchain; it self-skips where that is unavailable. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MACOS_TRAY_PATHS, MACOS_TRAY_SIZE, packIco, renderMacosTrayIcons, TRAY_ICON_PATHS, TRAY_ICON_SIZES, unpackIco,
  type IcoEntry,
} from '../scripts/render-tray-icon.ts'

/** Smallest valid-looking PNG stream: signature plus an IHDR chunk declaring the given edge. */
function pngStub(width: number, height = width): Buffer {
  const png = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12)
  png.writeUInt32BE(width, 16)
  png.writeUInt32BE(height, 20)
  return png
}

describe.skipIf(process.env.QILIN_DESKTOP_ICONS !== '1')('tray icon packaging', () => {
  it.skipIf(process.env.QILIN_DESKTOP_ICONS !== '1')('packs PNG entries into a Vista-style ICO directory and reads them back', () => {
    const entries: IcoEntry[] = [{ size: 16, png: pngStub(16) }, { size: 256, png: pngStub(256) }]
    const ico = packIco(entries)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)
    // 256 px is encoded as 0 in the one-byte edge fields.
    expect([ico.readUInt8(6 + 16), ico.readUInt8(6 + 17)]).toEqual([0, 0])
    expect(ico.readUInt32LE(6 + 12)).toBe(6 + 32)
    expect(unpackIco(ico)).toEqual(entries)
  })

  it.skipIf(process.env.QILIN_DESKTOP_ICONS !== '1')('rejects bitmaps that disagree with their declared edge, oversized edges, and non-PNG data', () => {
    expect(() => packIco([{ size: 16, png: pngStub(24) }])).toThrow('is 24x24, expected 16')
    expect(() => packIco([{ size: 512, png: pngStub(512) }])).toThrow('unsupported bitmap edge 512')
    expect(() => packIco([{ size: 16, png: Buffer.from('not a png stream, long enough to be read') }])).toThrow('not a PNG stream')
    expect(() => unpackIco(Buffer.from('BM'))).toThrow('not an ICO file')
    const forged = packIco([{ size: 16, png: pngStub(16) }])
    forged.writeUInt8(20, 6)
    expect(() => unpackIco(forged)).toThrow('declares 20 but holds 16x16')
  })

  it.skipIf(process.env.QILIN_DESKTOP_ICONS !== '1')('ships one crisp bitmap per supported display scale in the committed tray icon', () => {
    const entries = unpackIco(readFileSync(TRAY_ICON_PATHS.output))
    expect(entries.map(entry => entry.size)).toEqual([...TRAY_ICON_SIZES])
    for (const entry of entries) expect(entry.png.length).toBeGreaterThan(100)
  })

  it.skipIf(process.env.QILIN_DESKTOP_ICONS !== '1')('ships the menu bar PNG pair at both backing scales, drawn from the vector source', async () => {
    const { default: sharp } = await import('sharp')
    const render = async (path: string) => sharp(readFileSync(path)).metadata()
    // The platform resolves the @2x sibling by name, so the pair carries the two edge lengths it expects.
    expect(await render(MACOS_TRAY_PATHS.base)).toMatchObject({ width: MACOS_TRAY_SIZE, height: MACOS_TRAY_SIZE, hasAlpha: true })
    expect(await render(MACOS_TRAY_PATHS.retina))
      .toMatchObject({ width: MACOS_TRAY_SIZE * 2, height: MACOS_TRAY_SIZE * 2, hasAlpha: true })
    // The mark is opaque artwork on a transparent canvas, so a blank or cropped pair fails here.
    for (const path of [MACOS_TRAY_PATHS.base, MACOS_TRAY_PATHS.retina]) {
      const { channels } = await sharp(readFileSync(path)).stats()
      expect(channels[3]!.mean).toBeGreaterThan(0)
    }
    // A pair that no longer rasterizes from the vector source would ship a stale mark.
    const rendered = await renderMacosTrayIcons(readFileSync(MACOS_TRAY_PATHS.source))
    expect(await sharp(rendered.base).metadata()).toMatchObject({ width: MACOS_TRAY_SIZE, height: MACOS_TRAY_SIZE })
    expect(await sharp(rendered.retina).metadata())
      .toMatchObject({ width: MACOS_TRAY_SIZE * 2, height: MACOS_TRAY_SIZE * 2 })
  })
})
