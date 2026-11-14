/**
 * Minimal ZIP reader for Office packages: central-directory scan plus stored and
 * deflated entries, with the bounds an untrusted document needs.
 * @module @qilin-agent/office-read/src/zip
 */

import { inflateRawSync } from 'node:zlib'

/** One archive entry as the reader exposes it. */
export interface ZipEntry {
  /** Normalized entry name, forward slashes only. */
  readonly name: string
  /** Entry bytes after inflation. */
  readonly bytes: Uint8Array
}

/** Bounds applied while reading an untrusted archive. */
export interface ZipLimits {
  /** Entries the central directory may declare. */
  readonly maxEntries: number
  /** Bytes one entry may inflate to. */
  readonly maxEntryBytes: number
  /** Bytes every entry may inflate to together. */
  readonly maxTotalBytes: number
  /** Largest inflation ratio one entry may reach before the archive is refused. */
  readonly maxRatio: number
}

/** Why an archive cannot be read. */
export type ZipFailure = 'not-a-zip' | 'entry-too-large' | 'too-many-entries' | 'ratio-exceeded' | 'invalid-entry-name' | 'unsupported-compression'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

function u16(view: DataView, offset: number): number { return view.getUint16(offset, true) }
function u32(view: DataView, offset: number): number { return view.getUint32(offset, true) }

/** Whether one entry name could escape the archive root. */
function unsafeName(name: string): boolean {
  return name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')
}

/**
 * Read every entry of one Office package.
 * @param bytes - complete archive bytes.
 * @param limits - bounds applied to the archive and each entry.
 * @returns the entries in central-directory order.
 * @throws Error whose message is one {@link ZipFailure}.
 */
export function readZip(bytes: Uint8Array, limits: ZipLimits): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (u32(view, offset) === EOCD_SIGNATURE) { eocd = offset; break }
  }
  if (eocd === -1) throw new Error('not-a-zip')
  const count = u16(view, eocd + 10)
  if (count > limits.maxEntries) throw new Error('too-many-entries')
  const directoryOffset = u32(view, eocd + 16)
  const entries: ZipEntry[] = []
  let total = 0
  let cursor = directoryOffset
  for (let index = 0; index < count; index += 1) {
    if (u32(view, cursor) !== CENTRAL_SIGNATURE) throw new Error('not-a-zip')
    const method = u16(view, cursor + 10)
    const compressedSize = u32(view, cursor + 20)
    const uncompressedSize = u32(view, cursor + 24)
    const nameLength = u16(view, cursor + 28)
    const extraLength = u16(view, cursor + 30)
    const commentLength = u16(view, cursor + 32)
    const localOffset = u32(view, cursor + 42)
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    cursor += 46 + nameLength + extraLength + commentLength
    if (unsafeName(name)) throw new Error('invalid-entry-name')
    if (uncompressedSize > limits.maxEntryBytes) throw new Error('entry-too-large')
    total += uncompressedSize
    if (total > limits.maxTotalBytes) throw new Error('entry-too-large')
    if (compressedSize === 0 && uncompressedSize > 0) throw new Error('not-a-zip')
    if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxRatio) throw new Error('ratio-exceeded')
    if (u32(view, localOffset) !== LOCAL_SIGNATURE) throw new Error('not-a-zip')
    const localNameLength = u16(view, localOffset + 26)
    const localExtraLength = u16(view, localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const raw = bytes.subarray(start, start + compressedSize)
    let inflated: Uint8Array
    if (method === 0) inflated = raw
    else if (method === 8) inflated = new Uint8Array(inflateRawSync(raw, { maxOutputLength: limits.maxEntryBytes }))
    else throw new Error('unsupported-compression')
    entries.push({ name, bytes: inflated })
  }
  return entries
}

/**
 * Index entries by name.
 * @param entries - archive entries.
 * @returns entries keyed by their own name.
 */
export function byName(entries: readonly ZipEntry[]): ReadonlyMap<string, Uint8Array> {
  return new Map(entries.map(entry => [entry.name, entry.bytes]))
}
