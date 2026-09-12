/** Password hashing: one self-describing hash per password, and loud refusals for foreign values. */

import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/password.ts'

const PASSWORD = 'correct horse battery staple'

describe('password hashing', () => {
  it('stores a salted scrypt hash that verifies only its own password', async () => {
    const first = await hashPassword(PASSWORD)
    const second = await hashPassword(PASSWORD)
    expect(first).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/u)
    expect(second).not.toBe(first)
    expect(await verifyPassword(PASSWORD, first)).toBe(true)
    expect(await verifyPassword('another password', first)).toBe(false)
  })

  it('refuses a stored value this module did not write', async () => {
    for (const stored of [
      'sha256$deadbeef',
      'scrypt$32768$8$1$AAAA',
      'scrypt$32768$8$1$AAAA$AAAA$AA',
      'scrypt$notanumber$8$1$AAAA$AAAA',
      'scrypt$99999999999999999999$8$1$AAAA$AAAA',
      'scrypt$32768$8$1$AA*A$AAAA',
      'scrypt$32768$8$1$A$AAAA',
    ]) {
      await expect(verifyPassword(PASSWORD, stored), stored).rejects.toThrow(/malformed/u)
    }
  })

  it('reports a mismatch when the stored key was derived with other parameters', async () => {
    expect(await verifyPassword(PASSWORD, 'scrypt$32768$8$1$AAAA$AAAA')).toBe(false)
  })

  it('fails loudly when the stored cost cannot be derived', async () => {
    await expect(verifyPassword(PASSWORD, 'scrypt$3$8$1$AAAA$AAAA')).rejects.toThrow(/Invalid scrypt params/u)
  })
})
