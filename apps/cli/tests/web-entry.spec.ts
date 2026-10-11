/**
 * The deployment entry's own flags: one command carries the deployment's knobs,
 * and a value it cannot honour stops the process instead of quietly defaulting.
 */
import { describe, expect, it } from 'vitest'
import { isWebEntry, runWebEntry, WEB_ENTRY_PROFILE } from '../src/web-entry.ts'
import { TENANT_VARIABLE } from '../src/tenant-runtime.ts'

describe('the Web deployment entry', () => {
  it('serves the Web profile to every account', () => {
    expect(WEB_ENTRY_PROFILE).toBe('web')
  })

  it('treats a marked process as one account runtime rather than the entry', () => {
    const previous = process.env[TENANT_VARIABLE]
    try {
      Reflect.deleteProperty(process.env, TENANT_VARIABLE)
      expect(isWebEntry()).toBe(true)
      process.env[TENANT_VARIABLE] = '1'
      expect(isWebEntry()).toBe(false)
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, TENANT_VARIABLE)
      else process.env[TENANT_VARIABLE] = previous
    }
  })

  it('refuses a flag value it cannot honour', async () => {
    await expect(runWebEntry(['--port', 'eight'])).rejects.toThrow(/--port needs a whole number/u)
    await expect(runWebEntry(['--idle-ms', '-1'])).rejects.toThrow(/--idle-ms needs a whole number/u)
    await expect(runWebEntry(['--max-tenants', 'two'])).rejects.toThrow(/--max-tenants needs a whole number/u)
    await expect(runWebEntry(['--restart-backoff-ms', 'soon'])).rejects.toThrow(/--restart-backoff-ms needs a whole number/u)
  })
})
