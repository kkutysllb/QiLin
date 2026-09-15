import { describe, expect, it } from 'vitest'
import { isRemoteMethodNameAvailable } from '@qilin/api-gateway/client'

/** The reserved Client namespace surface is owned by the Client face, so this
 * invariant is asserted from the client program rather than a host-side spec. */
describe('plugin-manager Remote method names', () => {
  it('are clear of the Client namespace service surface', () => {
    // The namespace service owns these names, so the mutations carry a suffix.
    expect(isRemoteMethodNameAvailable('install')).toBe(false)
    expect(isRemoteMethodNameAvailable('remove')).toBe(false)
    for (const method of ['list', 'checkUpdates', 'catalog', 'installPlugin', 'updatePlugin', 'uninstallPlugin']) {
      expect(isRemoteMethodNameAvailable(method), method).toBe(true)
    }
  })
})
