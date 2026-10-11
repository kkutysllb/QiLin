/** The ledger endpoint: who may report, and whose account a report lands on. */

import { afterEach, describe, expect, it } from 'vitest'
import { readUsageTotals } from '../src/usage-ledger.ts'
import { routingCookie, startDeployment, type StartedDeployment } from './fixtures/deployment.ts'

const running: StartedDeployment[] = []

afterEach(async () => {
  for (const deployment of running.splice(0)) await deployment.dispose()
})

const report = { sessionId: 'session-1', inputTokens: 120, outputTokens: 30, at: 1_700_000_000_000 }

/** Hand one browser request to an account, which creates its runtime and token. */
async function handoff(deployment: StartedDeployment, username: string): Promise<void> {
  const id = deployment.accounts.get(username) ?? ''
  const response = await fetch(deployment.base, { headers: { cookie: routingCookie(id) } })
  expect(response.status).toBe(200)
}

/** The endpoint and token the hub started one account's runtime with. */
function usageOf(deployment: StartedDeployment, username: string): { url: string; token: string } {
  const id = deployment.accounts.get(username) ?? ''
  const usage = deployment.options.get(id)?.usage
  if (usage === undefined) throw new Error('the hub started that runtime with no usage endpoint')
  return usage
}

/** POST one body to the ledger with the given authorization. */
function post(url: string, body: string, authorization?: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authorization === undefined ? {} : { authorization } },
    body,
  })
}

describe('usage ledger endpoint', () => {
  it('books a report to the token it was minted for and refuses everything else', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice', 'bob'], maxTenants: 0 })
    running.push(deployment)
    await handoff(deployment, 'alice')
    await handoff(deployment, 'bob')
    const alice = usageOf(deployment, 'alice')
    const bob = usageOf(deployment, 'bob')
    const aliceId = deployment.accounts.get('alice') ?? ''
    const bobId = deployment.accounts.get('bob') ?? ''
    expect(alice.token).not.toBe(bob.token)

    expect((await post(alice.url, JSON.stringify(report), `Bearer ${alice.token}`)).status).toBe(204)
    // Alice's token books to Alice, whatever body it carries.
    expect((await readUsageTotals(deployment.home))[aliceId]).toEqual({
      sessions: 1, inputTokens: 120, outputTokens: 30, at: report.at,
    })
    expect((await readUsageTotals(deployment.home))[bobId]).toBeUndefined()

    // Bob reports on his own token, and lands in his own file.
    expect((await post(bob.url, JSON.stringify({ ...report, inputTokens: 7 }), `Bearer ${bob.token}`)).status).toBe(204)
    expect((await readUsageTotals(deployment.home))[bobId]).toMatchObject({ inputTokens: 7 })

    // No token, a foreign token, and a body that is not a report are refused,
    // and a refusal books nothing.
    expect((await post(alice.url, JSON.stringify({ ...report, inputTokens: 999 }))).status).toBe(401)
    expect((await post(alice.url, JSON.stringify({ ...report, inputTokens: 999 }), 'Bearer not-a-token')).status).toBe(401)
    expect((await post(alice.url, JSON.stringify({ sessionId: '' }), `Bearer ${alice.token}`)).status).toBe(400)
    expect((await post(alice.url, 'not json', `Bearer ${alice.token}`)).status).toBe(400)
    expect((await fetch(alice.url)).status).toBe(401)
    expect((await fetch(alice.url, { method: 'PUT' })).status).toBe(405)
    expect((await readUsageTotals(deployment.home))[aliceId]).toMatchObject({ inputTokens: 120 })
  })

  it('answers an account its own totals, and never another account\'s', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['alice', 'bob', 'carol'], maxTenants: 0 })
    running.push(deployment)
    for (const username of ['alice', 'bob', 'carol']) await handoff(deployment, username)
    const aliceId = deployment.accounts.get('alice') ?? ''
    const alice = usageOf(deployment, 'alice')
    const bob = usageOf(deployment, 'bob')
    const carol = usageOf(deployment, 'carol')

    /** Read the ledger with one runtime's token. */
    const read = (usage: { url: string; token: string }): Promise<Response> =>
      fetch(usage.url, { headers: { authorization: `Bearer ${usage.token}` } })

    await post(alice.url, JSON.stringify(report), `Bearer ${alice.token}`)
    await post(bob.url, JSON.stringify({ ...report, inputTokens: 7, outputTokens: 2 }), `Bearer ${bob.token}`)

    expect(await (await read(alice)).json()).toEqual({
      accountId: aliceId,
      total: { sessions: 1, inputTokens: 120, outputTokens: 30, at: report.at },
    })
    // Bob's token reads Bob, whatever Alice's ledger holds.
    expect(await (await read(bob)).json()).toMatchObject({ total: { inputTokens: 7, outputTokens: 2 } })
    // An account that never reported reads zeroes rather than an error.
    expect(await (await read(carol)).json()).toMatchObject({
      total: { sessions: 0, inputTokens: 0, outputTokens: 0, at: 0 },
    })
    // Only a minted token reads anything at all.
    expect((await fetch(alice.url, { headers: { authorization: 'Bearer not-a-token' } })).status).toBe(401)
    expect((await fetch(alice.url)).status).toBe(401)
  })

  it('lets the deployment administrator read every account, and no one else', { timeout: 60_000 }, async () => {
    const deployment = await startDeployment({ usernames: ['root', 'alice'], admins: ['root'], maxTenants: 0 })
    running.push(deployment)
    for (const username of ['root', 'alice']) await handoff(deployment, username)
    const root = usageOf(deployment, 'root')
    const alice = usageOf(deployment, 'alice')
    const aliceId = deployment.accounts.get('alice') ?? ''
    await post(alice.url, JSON.stringify(report), `Bearer ${alice.token}`)

    /** Read the ledger with one runtime's token. */
    const read = (usage: { url: string; token: string }): Promise<Response> =>
      fetch(usage.url, { headers: { authorization: `Bearer ${usage.token}` } })

    // The seat reads the deployment: every account's total and their sum.
    expect(await (await read(root)).json()).toEqual({
      scope: 'deployment',
      totals: { [aliceId]: { sessions: 1, inputTokens: 120, outputTokens: 30, at: report.at } },
      total: { sessions: 1, inputTokens: 120, outputTokens: 30, at: report.at },
    })
    // A member reads itself, in the shape that says so.
    const own = await (await read(alice)).json() as Record<string, unknown>
    expect(own).toEqual({ accountId: aliceId, total: { sessions: 1, inputTokens: 120, outputTokens: 30, at: report.at } })
    expect(own).not.toHaveProperty('totals')
  })
})
