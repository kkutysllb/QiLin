// @vitest-environment jsdom
/** The forge browser entry: one mount call carrying the panel Remote, and its disposer. */

import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mountForgePanel: vi.fn(async (_ctx: object, _remote: object) => async () => {}),
  remote: { namespace: 'forge' },
}))
vi.mock('../src/client/mount.ts', () => ({ mountForgePanel: mocks.mountForgePanel, inject: ['slots'] }))
vi.mock('@qilin-agent/experimental-client-ui-forge/remote', () => ({ default: mocks.remote }))

import { apply, inject } from '../src/client/index.ts'

describe('forge client entry', () => {
  it('mounts the panel with its Remote and returns the withdrawal', async () => {
    const ctx = {}
    const dispose = await apply(ctx as never)
    expect(mocks.mountForgePanel).toHaveBeenCalledWith(ctx, mocks.remote)
    expect(typeof dispose).toBe('function')
    await dispose()
    expect(inject).toEqual(['slots'])
  })
})
