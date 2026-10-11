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
    expect((await fetch(alice.url)).status).toBe(405)
    expect((await readUsageTotals(deployment.home))[aliceId]).toMatchObject({ inputTokens: 120 })
  })
})
