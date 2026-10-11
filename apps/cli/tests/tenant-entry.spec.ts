/** What the deployment's bare address answers, and how a browser chooses an account. */

import { afterEach, describe, expect, it } from 'vitest'
import { routingCookie, startDeployment, type StartedDeployment } from './fixtures/deployment.ts'

const running: StartedDeployment[] = []

afterEach(async () => {
  for (const deployment of running.splice(0)) await deployment.dispose()
})

/** Hand one browser request to an account, which creates its runtime. */
async function handoff(deployment: StartedDeployment, username: string): Promise<void> {
  const id = deployment.accounts.get(username) ?? ''
  expect((await fetch(deployment.base, { headers: { cookie: routingCookie(id) } })).status).toBe(200)
}

describe('deployment entry', () => {
  it('lists every account when a deployment holds several and the browser has chosen none', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice', 'bob'], maxTenants: 0 })
    running.push(deployment)

    const answer = await fetch(deployment.base)
    expect(answer.status).toBe(200)
    expect(answer.headers.get('content-type')).toContain('text/html')
    const page = await answer.text()
    // Every account is reachable from the deployment's own address, which is
    // what tells a person that each one has a path of its own.
    expect(page).toContain('href="/t/alice/"')
    expect(page).toContain('href="/t/bob/"')
  })

  it('releases the routing cookie when the browser signs out', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice', 'bob'], maxTenants: 0 })
    running.push(deployment)
    await handoff(deployment, 'alice')
    const id = deployment.accounts.get('alice') ?? ''

    const answer = await fetch(`${deployment.base}api/auth/logout`, {
      method: 'POST',
      headers: { cookie: routingCookie(id) },
    })
    // Signing out ends the runtime's session and this deployment's choice of
    // tenant, so the browser is free to sign in as another account.
    expect(String(answer.headers.get('set-cookie'))).toContain('qilin_tenant=')
    expect(String(answer.headers.get('set-cookie'))).toContain('Max-Age=0')
  })

  it('still redirects the bare address when there is one account to reach', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice'], maxTenants: 0 })
    running.push(deployment)

    const answer = await fetch(deployment.base, { redirect: 'manual' })
    expect(answer.status).toBe(302)
    expect(answer.headers.get('location')).toBe('/t/alice/')
  })

  it('routes a browser that already chose an account to it instead of listing', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice', 'bob'], maxTenants: 0 })
    running.push(deployment)
    await handoff(deployment, 'alice')

    const id = deployment.accounts.get('alice') ?? ''
    const answer = await fetch(deployment.base, { headers: { cookie: routingCookie(id) } })
    expect(answer.status).toBe(200)
    // The account's own runtime answers, not the deployment's list.
    expect(await answer.text()).not.toContain('/t/bob/')
  })

  it('hands a deployment with no accounts to its first-run runtime', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: [], maxTenants: 0 })
    running.push(deployment)
    expect((await fetch(deployment.base)).status).toBe(200)
  })
})
