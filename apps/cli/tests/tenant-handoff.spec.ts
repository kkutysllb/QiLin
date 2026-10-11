/** The hub's handoff cap under concurrent arrivals, over its real HTTP surface. */

import { afterEach, describe, expect, it } from 'vitest'
import { routingCookie, startDeployment, type StartedDeployment } from './fixtures/deployment.ts'

const running: StartedDeployment[] = []

afterEach(async () => {
  for (const deployment of running.splice(0)) await deployment.dispose()
})

describe('handoff cap over the hub surface', () => {
  it('reclaims before it starts when two handoffs arrive at once', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice', 'bob'], maxTenants: 1 })
    running.push(deployment)
    const aliceId = deployment.accounts.get('alice') ?? ''
    const bobId = deployment.accounts.get('bob') ?? ''
    const [alice, bob] = await Promise.all([
      fetch(deployment.base, { headers: { cookie: routingCookie(aliceId) } }),
      fetch(deployment.base, { headers: { cookie: routingCookie(bobId) } }),
    ])
    // A cap of one means two simultaneous handoffs can leave the loser without a
    // runtime: the reclaim may stop the very runtime its request was heading to.
    // What must hold is the cap, and that every answer a runtime gave names the
    // account whose cookie asked for it.
    for (const [response, id] of [[alice, aliceId], [bob, bobId]] as const) {
      expect([200, 503]).toContain(response.status)
      if (response.status === 200) expect(await response.text()).toBe(`served ${id}`)
    }
    expect([alice.status, bob.status]).toContain(200)

    // The cap held: the second start could only follow a reclaim, which is what
    // serializing the handoffs buys. Without it both would have found no running
    // runtime to reclaim and started, leaving two alive past a cap of one.
    const starts = deployment.log.filter(entry => entry.startsWith('start:'))
    const stops = deployment.log.filter(entry => entry.startsWith('stop:'))
    expect(starts).toHaveLength(2)
    expect(stops).toHaveLength(1)
    expect(deployment.log.indexOf(stops[0] as string)).toBeGreaterThan(deployment.log.indexOf(starts[0] as string))
    expect(deployment.log.indexOf(stops[0] as string)).toBeLessThan(deployment.log.indexOf(starts[1] as string))

    const status = await (await fetch(new URL('/status', deployment.base))).json() as { maxTenants: number; alive: number }
    expect(status.maxTenants).toBe(1)
    expect(status.alive).toBeLessThanOrEqual(1)
  })
})
