/**
 * Differential check of the worker Buffer's `base64url` support against Node.
 * The npm `buffer` package the worker bundles knows `base64` alone, so the shim
 * restates one spelling in the other around the package's own codec; Node's
 * encoding is the oracle for that restating. The patch therefore runs over
 * Node's Buffer here, whose `base64` half is native, and the packed-worker
 * acceptance run (apps/web preview boot) is what proves the same restating over
 * the package the browser bundles.
 */
import { Buffer } from 'node:buffer'
import { createHash as nodeCreateHash } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { createHash } from '../../src/node/builtin_modules/implemented/crypto.ts'
import {
  installBase64UrlEncoding, toStandardAlphabet, toUrlSafeAlphabet,
} from '../../src/polyfill/buffer/base64url.ts'

const native = {
  from: Buffer.from,
  isEncoding: Buffer.isEncoding,
  byteLength: Buffer.byteLength,
  toString: Buffer.prototype.toString,
  write: Buffer.prototype.write,
}

installBase64UrlEncoding(Buffer)

afterAll(() => {
  Buffer.from = native.from
  Buffer.isEncoding = native.isEncoding
  Buffer.byteLength = native.byteLength
  Buffer.prototype.toString = native.toString
  Buffer.prototype.write = native.write
})

/** One deterministic byte sequence per length, covering every padding case. */
function corpus(): Buffer[] {
  let seed = 0x2f6e2b1
  const next = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % 256 }
  const arrays = [Buffer.alloc(0), Buffer.from([0xfb]), Buffer.from([0xfb, 0xef, 0xbe])]
  for (const length of [1, 2, 3, 5, 7, 8, 16, 31, 32, 64]) {
    arrays.push(Buffer.from(Array.from({ length }, next)))
  }
  // The bytes whose standard spelling uses the two characters the alphabets
  // differ in, and the four-byte case that exercises both at once.
  arrays.push(Buffer.from([0xff, 0xff, 0xff]), Buffer.from([0xfb, 0xef, 0xbe, 0xff]))
  return arrays
}

const ARRAYS = corpus()

/** Node's own spelling of one byte sequence, the oracle every case compares to. */
const nodeUrlSafe = (bytes: Buffer): string => native.toString.call(bytes, 'base64url')

describe('the Buffer base64url patch', () => {
  it('encodes every byte sequence as Node does', () => {
    for (const bytes of ARRAYS) {
      expect(bytes.toString('base64url')).toBe(nodeUrlSafe(bytes))
      expect(Buffer.from(bytes).toString('base64url')).toBe(nodeUrlSafe(bytes))
      expect(toUrlSafeAlphabet(native.toString.call(bytes, 'base64'))).toBe(nodeUrlSafe(bytes))
    }
    expect(Buffer.from('abc').toString('base64url')).toBe('YWJj')
    expect(Buffer.from([0xfb, 0xef, 0xbe, 0xff]).toString('base64url')).toBe('----_w')
  })

  it('decodes both spellings and both paddings', () => {
    for (const bytes of ARRAYS) {
      const urlSafe = nodeUrlSafe(bytes)
      expect([...Buffer.from(urlSafe, 'base64url')]).toEqual([...bytes])
      expect([...Buffer.from(native.toString.call(bytes, 'base64'), 'base64url')]).toEqual([...bytes])
      expect([...Buffer.from(toStandardAlphabet(urlSafe), 'base64url')]).toEqual([...bytes])
      // The encoding name is case-insensitive, as Node's is.
      expect([...Buffer.from(urlSafe, 'BASE64URL' as BufferEncoding)]).toEqual([...bytes])
    }
    expect([...Buffer.from('----_w', 'base64url')]).toEqual([0xfb, 0xef, 0xbe, 0xff])
  })

  it('answers the encoding table and the byte count as Node does', () => {
    expect(Buffer.isEncoding('base64url')).toBe(true)
    expect(Buffer.isEncoding('BASE64URL')).toBe(true)
    expect(Buffer.isEncoding('hex')).toBe(true)
    expect(Buffer.isEncoding('nope')).toBe(native.isEncoding('nope'))
    for (const bytes of ARRAYS) {
      const urlSafe = nodeUrlSafe(bytes)
      expect(Buffer.byteLength(urlSafe, 'base64url')).toBe(native.byteLength(urlSafe, 'base64url'))
      // A non-string keeps its own byte count: the encoding spells a string.
      expect(Buffer.byteLength(bytes, 'base64url')).toBe(bytes.length)
    }
  })

  it('writes URL-safe base64 into a buffer, and leaves the literal token alone', () => {
    for (const bytes of ARRAYS) {
      const urlSafe = nodeUrlSafe(bytes)
      const target = Buffer.alloc(bytes.length)
      expect(target.write(urlSafe, 'base64url')).toBe(bytes.length)
      expect([...target]).toEqual([...bytes])
      const ranged = Buffer.alloc(bytes.length + 1)
      expect(ranged.write(urlSafe, 1, bytes.length, 'base64url')).toBe(bytes.length)
      expect([...ranged.subarray(1)]).toEqual([...bytes])
    }
    // A written string that reads `base64url` is data, not an encoding argument.
    const literal = Buffer.alloc(16)
    expect(literal.write('base64url')).toBe(9)
    expect(literal.toString('utf8', 0, 9)).toBe('base64url')
    expect([...Buffer.alloc(4, '----_w', 'base64url')]).toEqual([0xfb, 0xef, 0xbe, 0xff])
  })

  it('leaves the encodings the package already owns to the package', () => {
    expect(Buffer.from('aGk=', 'base64').toString()).toBe('hi')
    expect(Buffer.from('hi').toString('base64')).toBe('aGk=')
    expect(Buffer.from('hi').toString('hex')).toBe('6869')
    expect(Buffer.byteLength('hé', 'utf8')).toBe(native.byteLength('hé', 'utf8'))
    const target = Buffer.alloc(4)
    expect(target.write('hi', 'utf8')).toBe(2)
  })

  it('carries the spelling through the crypto shim digest', () => {
    for (const algorithm of ['sha1', 'sha256', 'sha512']) {
      expect(createHash(algorithm).update('127.0.0.1:58878').digest('base64url'))
        .toBe(nodeCreateHash(algorithm).update('127.0.0.1:58878').digest('base64url'))
    }
    expect(createHash('sha256').update('abc').digest('base64'))
      .toBe(nodeCreateHash('sha256').update('abc').digest('base64'))
  })

  it('restates one alphabet in the other', () => {
    expect(toStandardAlphabet('----_w')).toBe('++++/w==')
    expect(toStandardAlphabet('YWJj')).toBe('YWJj')
    expect(toStandardAlphabet('YWJjZGU')).toBe('YWJjZGU=')
    expect(toUrlSafeAlphabet('++++/w==')).toBe('----_w')
    expect(toUrlSafeAlphabet('YWJj')).toBe('YWJj')
  })
})
