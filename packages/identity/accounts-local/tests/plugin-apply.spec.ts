/** The defaults `apply` documents for callers that mount it without the row's config schema. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@qilin-agent/kylin'
import { apply } from '../src/index.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true, maxRetries: 3 })
  root = undefined
})

interface Mounted {
  readonly ctx: Context
  readonly routes: unknown[]
  readonly authorities: unknown[]
}

/** The two connection halves `apply` mounts into, recording what reaches them. */
function connection(): Mounted {
  const routes: unknown[] = []
  const authorities: unknown[] = []
  const ctx = {
    connection: {
      fetch: { register: (route: unknown) => { routes.push(route) } },
      session: { install: (authority: unknown) => { authorities.push(authority) } },
    },
  } as unknown as Context
  return { ctx, routes, authorities }
}

describe('apply defaults', () => {
  it('mounts the auth endpoints and the session gate when the config names neither', async () => {
    root = await mkdtemp(join(tmpdir(), 'qilin-accounts-apply-'))
    const mounted = connection()
    await apply(mounted.ctx, { qilinHome: root })
    expect(mounted.routes.length).toBeGreaterThan(0)
    expect(mounted.authorities).toHaveLength(1)
  })

  it('leaves the gate out while keeping the endpoints when it is disabled', async () => {
    root = await mkdtemp(join(tmpdir(), 'qilin-accounts-apply-'))
    const mounted = connection()
    await apply(mounted.ctx, { qilinHome: root, enabled: false })
    expect(mounted.routes.length).toBeGreaterThan(0)
    expect(mounted.authorities).toHaveLength(0)
  })
})
