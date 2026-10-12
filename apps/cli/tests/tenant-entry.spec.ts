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

  it('routes a signed-in browser’s non-document requests to its own account’s runtime', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({
      usernames: ['alice', 'bob'],
      maxTenants: 0,
      signedIn: (cookie, accounts) => cookie === undefined ? undefined : { id: accounts.get('alice') ?? '' },
    })
    running.push(deployment)
    const aliceId = deployment.accounts.get('alice') ?? ''

    // The doors clear the routing cookie, and the composer keeps calling
    // before any document navigation re-arms it: those calls must reach
    // alice's runtime, never the first-run one, or the deployment writes its
    // data into two runtimes at once and every history read splits.
    const answer = await fetch(deployment.base + '/api/session/list', {
      method: 'POST',
      headers: { cookie: 'qilin-session-anything=1' },
    })
    expect(answer.status).toBe(200)
    expect(await answer.text()).toBe('served ' + aliceId)
    expect(String(answer.headers.get('set-cookie'))).toContain(routingCookie(aliceId))

    // A browser the session does not name keeps the first-run answer.
    const anonymous = await fetch(deployment.base + '/api/session/list', { method: 'POST' })
    expect(anonymous.status).toBe(200)
    expect(await anonymous.text()).toBe('served first-run')
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

  it('follows the deployment\'s own registration policy, whatever the roster holds', { timeout: 60_000 }, async () => {
    // The operator's flag decides both ways: a deployment that takes new
    // accounts keeps taking them once one exists, and one that does not takes
    // none even while the roster is empty.
    const occupied = await startDeployment({ usernames: ['alice'], maxTenants: 0, registration: 'open' })
    running.push(occupied)
    await page(occupied.base)
    expect(occupied.options.get('first-run')?.registration).toBe('open')

    const closed = await startDeployment({ usernames: ['alice'], maxTenants: 0, registration: 'closed' })
    running.push(closed)
    await page(closed.base)
    expect(closed.options.get('first-run')?.registration).toBe('closed')
  })

  it('keeps accepting new accounts after the first one exists', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: [], maxTenants: 0, registration: 'open' })
    running.push(deployment)
    await page(deployment.base)
    expect(deployment.options.get('first-run')?.registration).toBe('open')

    const store = await AccountStore.open(accountsFilePath(deployment.home))
    await store.add({ username: 'first' }, 'password-1')

    // The account that just registered does not close the door behind it: an
    // operator who accepts new accounts keeps their register entry, and the
    // runtime answering the landing is not swapped out from under the browser.
    await page(deployment.base)
    expect(deployment.options.get('first-run')?.registration).toBe('open')
    expect(deployment.log).not.toContain('stop:first-run')
  })

  it('answers a chosen browser at the deployment\u2019s own doors, and drops its choice there', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice'], maxTenants: 0, registration: 'open' })
    running.push(deployment)
    const aliceId = deployment.accounts.get('alice') ?? ''

    // The sign-in document belongs to the deployment, so it is answered by the
    // runtime that carries the deployment's policy — the first-run runtime — even
    // though this browser has already chosen an account: a tenant runtime narrows
    // admission to one account, and the accounts plugin requires that narrowing to
    // keep registration closed, so it could neither offer registration nor sign a
    // browser in as anybody else.
    const door = await page(`${deployment.base}login`, routingCookie(aliceId))
    expect(await door.text()).toBe('served first-run')
    expect(deployment.options.has(aliceId)).toBe(false)
    // Choosing again is what a browser at a door is doing, so the stale choice goes.
    expect(door.headers.get('set-cookie') ?? '').toContain('qilin_tenant=;')

    // Everything that is the account's own still reaches that account's runtime.
    const workbench = await page(`${deployment.base}workspace`, routingCookie(aliceId))
    expect(await workbench.text()).toBe(`served ${aliceId}`)
    expect(deployment.options.has(aliceId)).toBe(true)
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
