/**
 * Password hashing for local accounts: scrypt with a per-account salt, encoded
 * as one self-describing string so a stored hash carries the parameters it was
 * derived under. The cost keeps one verification in the tens of milliseconds,
 * which is the only brute-force brake a local server has.
 * @module @qilin/accounts-local/src/password
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const KEY_BYTES = 32
const SALT_BYTES = 16
/** scrypt cost: 2^15 iterations, the interactive-login tier. */
const COST = 32768
const BLOCK_SIZE = 8
const PARALLELISM = 1
// scrypt reserves 128 * N * r bytes (32 MiB at this cost) plus overhead; the
// Node default cap of 32 MiB sits exactly on that boundary.
const MAX_MEMORY_BYTES = 96 * 1024 * 1024
const SCHEME = 'scrypt'
const SEGMENTS = 6

/** One decoded stored hash. */
interface ScryptHash {
  readonly cost: number
  readonly blockSize: number
  readonly parallelism: number
  readonly salt: Buffer
  readonly key: Buffer
}

/** Decode a segment holding a non-negative integer. */
function decodeInteger(value: string | undefined, malformed: () => never): number {
  if (value === undefined || !/^[0-9]+$/u.test(value)) malformed()
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) malformed()
  return parsed
}

/** Decode one canonical base64url segment. */
function decodeSegment(value: string | undefined, malformed: () => never): Buffer {
  if (value === undefined || !/^[A-Za-z0-9_-]+$/u.test(value)) malformed()
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.toString('base64url') !== value) malformed()
  return decoded
}

/**
 * Decode one stored hash string.
 * @param encoded - the stored value.
 * @returns its parameters, salt, and derived key.
 * @throws Error when the stored value is not a hash this module wrote.
 */
function decodeHash(encoded: string): ScryptHash {
  const malformed = (): never => {
    throw new Error('accounts-local: stored password hash is malformed')
  }
  const segments = encoded.split('$')
  if (segments.length !== SEGMENTS || segments[0] !== SCHEME) malformed()
  return {
    cost: decodeInteger(segments[1], malformed),
    blockSize: decodeInteger(segments[2], malformed),
    parallelism: decodeInteger(segments[3], malformed),
    salt: decodeSegment(segments[4], malformed),
    key: decodeSegment(segments[5], malformed),
  }
}

/** Derive one key under the given parameters. */
function derive(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelism: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, {
      N: cost,
      r: blockSize,
      p: parallelism,
      maxmem: MAX_MEMORY_BYTES,
    }, (error, key) => {
      /* v8 ignore next 4 -- node:crypto validates scrypt parameters synchronously and reports every
      rejected parameter by throwing, so the callback's error channel has no reachable input */
      if (error !== null) {
        reject(error)
        return
      }
      resolve(key)
    })
  })
}

/**
 * Derive the stored representation of one password.
 * @param password - the plaintext password.
 * @returns the encoded hash, salt and parameters included.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM)
  return [
    SCHEME,
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELISM),
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$')
}

/**
 * Verify one password against a stored hash, in constant time.
 * @param password - the submitted plaintext password.
 * @param encoded - the stored hash from the account file.
 * @returns true only when the derived key matches the stored key.
 * @throws Error when the stored value is not a hash this module wrote.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const stored = decodeHash(encoded)
  const key = await derive(password, stored.salt, stored.cost, stored.blockSize, stored.parallelism)
  return key.byteLength === stored.key.byteLength && timingSafeEqual(key, stored.key)
}
