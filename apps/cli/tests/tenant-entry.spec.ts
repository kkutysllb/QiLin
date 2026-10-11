/** What the deployment's bare address answers, and how a signed-in browser reaches its account. */

import { afterEach, describe, expect, it } from 'vitest'
import { AccountStore, accountsFilePath } from '@qilin-agent/accounts-local'
import { routingCookie, startDeployment, type StartedDeployment } from './fixtures/deployment.ts'

const running: StartedDeployment[] = []

afterEach(async () => {
  for (const deployment of running.splice(0)) await deployment.dispose()
})

/** One page request, as a browser makes it, carrying whatever cookie the test holds. */
function page(url: string, cookie?: string): Promise<Response> {
  return fetch(url, {
    redirect: 'manual',
    headers: { accept: 'text/html', ...cookie === undefined ? {} : { cookie } },
  })
}

/** Hand one browser request to an account, which creates its runtime. */
async function handoff(deployment: StartedDeployment, username: string): Promise<void> {
  const id = deployment.accounts.get(username) ?? ''
  expect((await page(deployment.base, routingCookie(id))).status).toBe(200)
}

describe('deployment entry', () => {
  it('answers the bare address with the product\u2019s own landing, naming no account', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice', 'bob'], maxTenants: 0 })
    running.push(deployment)

    const answer = await page(deployment.base)
    expect(answer.status).toBe(200)
    // The deployment serves no roster of its own: the product's form is the way
    // in, and each account's runtime is where a signed-in browser lands.
    const body = await answer.text()
    expect(body).toBe('served first-run')
    expect(body).not.toContain('alice')
    expect(body).not.toContain('bob')
  })

  it('hands a browser that signed in at the landing to its own account\u2019s runtime', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({
      usernames: ['alice', 'bob'],
      maxTenants: 0,
      signedIn: (cookie, accounts) => cookie === undefined ? undefined : { id: accounts.get('alice') ?? '' },
    })
    running.push(deployment)
    const aliceId = deployment.accounts.get('alice') ?? ''

    // The browser carries the session the landing page signed and no routing
    // cookie, so the deployment asks the runtime who that is and sends it on.
    const answer = await page(deployment.base, 'qilin-session-anything=1')
    expect(answer.status).toBe(303)
    expect(answer.headers.get('location')).toBe('/')
    expect(String(answer.headers.get('set-cookie'))).toContain(routingCookie(aliceId))

    // The browser follows, and alice's own runtime answers from then on.
    const landed = await page(deployment.base, routingCookie(aliceId))
    expect(landed.status).toBe(200)
    expect(await landed.text()).toBe('served ' + aliceId)
  })

  it('leaves a browser whose session names no account of this roster on the landing', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({
      usernames: ['alice'],
      maxTenants: 0,
      signedIn: () => ({ id: 'ghost-account' }),
    })
    running.push(deployment)

    const answer = await page(deployment.base, 'qilin-session-anything=1')
    expect(answer.status).toBe(200)
    expect(await answer.text()).toBe('served first-run')
    expect(answer.headers.get('set-cookie')).toBeNull()
  })

  it('refuses new accounts once the roster holds one', { timeout: 60_000 }, async () => {
    // Configured to accept new accounts, and still refusing them: the roster is
    // what decides, not the flag.
    const occupied = await startDeployment({ usernames: ['alice'], maxTenants: 0, registration: 'open' })
    running.push(occupied)
    await page(occupied.base)
    expect(occupied.options.get('first-run')?.registration).toBe('closed')

    const empty = await startDeployment({ usernames: [], maxTenants: 0, registration: 'open' })
    running.push(empty)
    await page(empty.base)
    expect(empty.options.get('first-run')?.registration).toBe('open')
  })

  it('replaces the first-run runtime when the roster gains its first account', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: [], maxTenants: 0, registration: 'open' })
    running.push(deployment)
    await page(deployment.base)
    expect(deployment.options.get('first-run')?.registration).toBe('open')
    expect(deployment.log).not.toContain('stop:first-run')

    const store = await AccountStore.open(accountsFilePath(deployment.home))
    await store.add({ username: 'first' }, 'password-1')

    // The product's form must stop offering registration on the very next page:
    // the runtime that carries the old answer is replaced, not left answering.
    await page(deployment.base)
    expect(deployment.options.get('first-run')?.registration).toBe('closed')
    expect(deployment.log).toContain('stop:first-run')
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
    // account, so the browser is free to sign in as another one.
    expect(String(answer.headers.get('set-cookie'))).toContain('qilin_tenant=')
    expect(String(answer.headers.get('set-cookie'))).toContain('Max-Age=0')
  })
})
